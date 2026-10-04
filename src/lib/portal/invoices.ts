import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { config } from '@/lib/config';
import type { AppDatabase } from '@/lib/db';
import { dbFromRequest } from '@/lib/db/request';
import { rowsFromExecute } from '@/lib/db/rows';
import {
  candidatePremiumPlans,
  companies,
  jobPackages,
  portalInvoiceItems,
  portalInvoices,
  recruiterPlans,
  type OrderRow,
  type PortalInvoiceItemRow,
  type PortalInvoiceRow,
} from '@/lib/db/portal-schema';
import { users } from '@/lib/db/schema';
import { sendInvoiceIssued } from '@/lib/email/transactional/dispatch';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { renderInvoicePdf } from '@/lib/pdf/invoice';
import { getFile, putFile, StorageError } from '@/lib/storage';
import { sanitizeFilename } from '@/lib/uploads/validation';

/**
 * Portal invoices (see §18 of the brief).
 *
 * The rules this module exists to guarantee:
 *
 *  1. ONE INVOICE PER ORDER, EVER. The unique index on
 *     `portal_invoices.order_id` is the backstop; issuance checks first and
 *     returns the existing document, so a replayed webhook cannot bill a
 *     customer twice.
 *  2. SEQUENTIAL, YEAR-SCOPED NUMBERS. `RVLYT-2026-000001` is allocated under
 *     a per-year advisory lock inside the caller's transaction, so two
 *     concurrent payments cannot mint the same number and no sequence table is
 *     needed to keep gaps out.
 *  3. SNAPSHOTS, NEVER LIVE LOOKUPS. Plan name, price split, tax rate and
 *     customer details are copied at issue time: an invoice must not change
 *     when a plan is repriced or a company renamed afterwards.
 *  4. THE TOTAL IS WHAT WAS CHARGED. `orders.amountMinor` is the gross amount
 *     settled at the gateway; the subtotal/tax split is derived from it using
 *     the tax rate, so the document always reconciles with the payment.
 */

/** Either the root database or the caller's transaction. */
type DbExecutor = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

/** Price split derived from the gross amount actually charged. */
export function taxSplitFromGross(
  grossMinor: number,
  taxRateBasisPoints: number
): { subtotalMinor: number; taxMinor: number } {
  const gross = Math.max(0, Math.round(grossMinor));
  const bp = Math.max(0, Math.round(taxRateBasisPoints));
  if (bp === 0) return { subtotalMinor: gross, taxMinor: 0 };
  const subtotal = Math.round((gross * 10000) / (10000 + bp));
  return { subtotalMinor: subtotal, taxMinor: gross - subtotal };
}

/**
 * Allocates the next invoice number for the current year.
 *
 * The advisory lock serialises allocators on this executor (xact-scoped, so it
 * is released on commit), which means COUNT-based numbering cannot collide
 * between concurrent issuances. The unique index remains the final guard.
 */
async function nextInvoiceNumberWith(tx: DbExecutor, now: Date): Promise<string> {
  const year = now.getUTCFullYear();
  const head = `${config.PORTAL_INVOICE_NUMBER_PREFIX}-${year}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rvly-invoice:${year}`}))`);
  const result = await tx.execute(
    sql`SELECT COUNT(*)::int AS issued FROM portal_invoices WHERE invoice_number LIKE ${`${head}-%`}`
  );
  const issued = rowsFromExecute<{ issued: number }>(result)[0]?.issued ?? 0;
  return `${head}-${String(issued + 1).padStart(6, '0')}`;
}

/** Human description of what an order bought, for the invoice line item. */
async function describeOrderWith(
  tx: DbExecutor,
  order: OrderRow
): Promise<{ description: string; planCode: string | null; billingPeriod: string | null }> {
  if (order.orderType === 'recruiter_plan') {
    const [plan] = await tx
      .select()
      .from(recruiterPlans)
      .where(eq(recruiterPlans.id, order.packageId))
      .limit(1);
    if (plan) {
      const period = order.billingPeriod === 'annual' ? 'Annual' : 'Monthly';
      return {
        description: `${plan.name} recruiter plan — ${period} subscription`,
        planCode: plan.code,
        billingPeriod: order.billingPeriod,
      };
    }
  } else if (order.orderType === 'candidate_premium') {
    const [plan] = await tx
      .select()
      .from(candidatePremiumPlans)
      .where(eq(candidatePremiumPlans.id, order.packageId))
      .limit(1);
    if (plan) {
      return {
        description: plan.name,
        planCode: plan.code,
        billingPeriod: plan.billingPeriod,
      };
    }
  } else if (order.orderType === 'job_package') {
    const [pkg] = await tx
      .select()
      .from(jobPackages)
      .where(eq(jobPackages.id, order.packageId))
      .limit(1);
    if (pkg) {
      return {
        description: `${pkg.name} — ${pkg.credits} job credit${pkg.credits === 1 ? '' : 's'}`,
        planCode: pkg.code,
        billingPeriod: null,
      };
    }
  }

  return { description: `Purchase ${order.orderNumber}`, planCode: null, billingPeriod: null };
}

function toInvoiceLineInput(row: PortalInvoiceItemRow): {
  description: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
  taxRateBasisPoints: number;
  isTaxLine: boolean;
} {
  return {
    description: row.description,
    quantity: row.quantity,
    unitAmountMinor: row.unitAmountMinor,
    amountMinor: row.amountMinor,
    taxRateBasisPoints: row.taxRateBasisPoints,
    isTaxLine: row.isTaxLine,
  };
}

/** Creates the private PDF for an invoice when it does not already have one. */
export async function ensureInvoicePdfWith(
  tx: DbExecutor,
  invoiceId: string
): Promise<void> {
  const [invoice] = await tx
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.id, invoiceId))
    .limit(1);
  if (!invoice || invoice.pdfStorageKey) return;

  const items = await tx
    .select()
    .from(portalInvoiceItems)
    .where(eq(portalInvoiceItems.invoiceId, invoice.id))
    .orderBy(portalInvoiceItems.sortOrder);

  const rendered = await renderInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    description: invoice.description,
    status: invoice.status,
    currency: invoice.currency,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerAddress: invoice.customerAddress,
    customerGstin: invoice.customerGstin,
    placeOfSupply: invoice.placeOfSupply,
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    taxRateBasisPoints: invoice.taxRateBasisPoints,
    billingPeriod: invoice.billingPeriod,
    periodStart: invoice.periodStart ? invoice.periodStart.toISOString() : null,
    periodEnd: invoice.periodEnd ? invoice.periodEnd.toISOString() : null,
    paymentReference: invoice.paymentReference,
    notes: null,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
    lines: items.map(toInvoiceLineInput),
  });

  try {
    const stored = await putFile('pdf', rendered.body, 'application/pdf');
    await tx
      .update(portalInvoices)
      .set({ pdfStorageKey: stored.storageKey, updatedAt: new Date() })
      .where(eq(portalInvoices.id, invoice.id));
  } catch (error) {
    if (error instanceof StorageError) {
      throw new AppError(AppErrorCode.INTERNAL_ERROR, 'The invoice PDF could not be stored.', 500);
    }
    throw error;
  }
}

/**
 * Issues the invoice for a PAID order, inside the caller's transaction.
 *
 * Called from `markOrderPaidAndGrantCredits` so the payment, the entitlement
 * and the invoice commit together: a customer can never be charged with no
 * invoice, and a crash can never leave two invoices for one order.
 *
 * Idempotent: if an invoice already exists for this order (a replay, or a
 * retry after a later step failed), the existing document is returned unchanged.
 */
export async function issueInvoiceForOrderWith(
  tx: DbExecutor,
  input: {
    order: OrderRow;
    /** Gateway payment reference (the provider's payment id string). */
    paymentReference?: string | null;
    /** Recruiter subscription, when this order funds one. */
    subscriptionId?: string | null;
    /** Candidate premium subscription, when this order funds one. */
    candidateSubscriptionId?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    now?: Date;
  }
): Promise<PortalInvoiceRow> {
  const { order } = input;
  const now = input.now ?? new Date();

  const [existing] = await tx
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.orderId, order.id))
    .limit(1);
  if (existing) return existing;

  const [buyer] = await tx
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);
  const [company] = await tx
    .select({ name: companies.name, location: companies.location })
    .from(companies)
    .where(eq(companies.id, order.companyId))
    .limit(1);

  const { description, planCode, billingPeriod } = await describeOrderWith(tx, order);

  const bp = Math.max(0, config.BILLING_TAX_RATE_BASIS_POINTS);
  const gross = Math.max(0, order.amountMinor);
  const { subtotalMinor, taxMinor } = taxSplitFromGross(gross, bp);

  const invoiceNumber = await nextInvoiceNumberWith(tx, now);

  // Candidate purchases are billed to the PERSON (the placeholder company is an
  // internal bookkeeping device, never the invoice party); employer purchases
  // are billed to the organisation.
  const employerOrder = order.orderType !== 'candidate_premium';
  const customerName = employerOrder
    ? company?.name ?? buyer?.name ?? 'Customer'
    : buyer?.name ?? 'Customer';
  const customerEmail = buyer?.email ?? '';

  const [invoice] = await tx
    .insert(portalInvoices)
    .values({
      invoiceNumber,
      userId: order.userId,
      companyId: order.companyId,
      orderId: order.id,
      subscriptionId: input.subscriptionId ?? null,
      candidateSubscriptionId: input.candidateSubscriptionId ?? null,
      invoiceType: order.orderType,
      planCode,
      description,
      billingPeriod,
      status: 'paid',
      subtotalMinor,
      taxMinor,
      totalMinor: gross,
      taxRateBasisPoints: bp,
      currency: order.currency,
      customerName,
      customerEmail,
      customerAddress: employerOrder ? company?.location ?? null : null,
      paymentReference: input.paymentReference ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      issuedAt: now,
      paidAt: order.paidAt ?? now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  // A concurrent issuance won the unique index on order_id: its document is the
  // one invoice for this order, and it is returned as-is.
  if (!invoice) {
    const [raced] = await tx
      .select()
      .from(portalInvoices)
      .where(eq(portalInvoices.orderId, order.id))
      .limit(1);
    if (!raced) {
      throw new Error('Invoice issuance failed without an existing document.');
    }
    return raced;
  }

  const items: (typeof portalInvoiceItems.$inferInsert)[] = [
    {
      invoiceId: invoice.id,
      description,
      quantity: 1,
      unitAmountMinor: subtotalMinor,
      amountMinor: subtotalMinor,
      taxRateBasisPoints: bp,
      isTaxLine: false,
      sortOrder: 0,
    },
  ];
  if (taxMinor > 0) {
    items.push({
      invoiceId: invoice.id,
      description: `GST @ ${(bp / 100).toFixed(2)}%`,
      quantity: 1,
      unitAmountMinor: taxMinor,
      amountMinor: taxMinor,
      taxRateBasisPoints: bp,
      isTaxLine: true,
      sortOrder: 999,
    });
  }
  await tx.insert(portalInvoiceItems).values(items);
  await ensureInvoicePdfWith(tx, invoice.id);

  return invoice;
}

/**
 * Mails the invoice for a paid order and records when it was accepted.
 *
 * Runs strictly AFTER the invoice row has committed, and is deliberately
 * incapable of throwing into the payment path: a customer who has paid must
 * never have that payment rolled back because a mail server was slow or down.
 *
 * Two honesty rules are enforced here:
 *
 *  1. `emailedAt` is written from the dispatch RESULT, never optimistically. A
 *     column that claims an email went out when no provider is configured is
 *     exactly the kind of fabricated success this codebase refuses elsewhere.
 *  2. The amounts come from the stored invoice snapshot, so the email always
 *     quotes the document the customer can also download.
 *
 * An already-emailed invoice is skipped, so a replayed webhook does not send a
 * second copy.
 */
export async function emailInvoiceForOrder(orderId: string): Promise<boolean> {
  try {
    const { db } = dbFromRequest();
    const [invoice] = await db
      .select()
      .from(portalInvoices)
      .where(eq(portalInvoices.orderId, orderId))
      .limit(1);
    // Nothing to send: either no invoice was issued, or it already went out.
    if (!invoice || invoice.emailedAt) return false;

    const currency = invoice.currency;
    const format = (minor: number): string =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
      }).format(minor / 100);

    const result = await sendInvoiceIssued({
      to: invoice.customerEmail,
      recipientName: invoice.customerName,
      invoiceNumber: invoice.invoiceNumber,
      description: invoice.description,
      subtotalLabel: format(invoice.subtotalMinor),
      taxLabel:
        invoice.taxRateBasisPoints > 0
          ? `${format(invoice.taxMinor)} (${(invoice.taxRateBasisPoints / 100).toFixed(2)}%)`
          : format(invoice.taxMinor),
      totalLabel: format(invoice.totalMinor),
      dashboardPath: invoice.companyId ? '/employer/invoices' : '/candidate/premium',
    });

    if (result.delivered) {
      await db
        .update(portalInvoices)
        .set({ emailedAt: new Date(), updatedAt: new Date() })
        .where(eq(portalInvoices.id, invoice.id));
    }
    return result.delivered;
  } catch {
    // Never propagate: the payment has already settled.
    return false;
  }
}

/**
 * An invoice as a client is allowed to see it.
 *
 * Built by an explicit mapping rather than by returning the row, because the row
 * also carries `pdfStorageKey` — a private storage key. Handing that to a browser
 * would turn "the PDF is not publicly reachable" into "anyone who can read the
 * invoice list learns the object's private path".
 */
export interface InvoiceDTO {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  planCode: string | null;
  description: string;
  billingPeriod: string | null;
  status: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxRateBasisPoints: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string | null;
  customerGstin: string | null;
  placeOfSupply: string | null;
  paymentReference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  paidAt: string | null;
}

/** Whitelists the invoice fields a client may see, and normalises dates to ISO. */
function toInvoiceDTO(row: PortalInvoiceRow): InvoiceDTO {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceType: row.invoiceType,
    planCode: row.planCode,
    description: row.description,
    billingPeriod: row.billingPeriod,
    status: row.status,
    subtotalMinor: row.subtotalMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    taxRateBasisPoints: row.taxRateBasisPoints,
    currency: row.currency,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerAddress: row.customerAddress,
    customerGstin: row.customerGstin,
    placeOfSupply: row.placeOfSupply,
    paymentReference: row.paymentReference,
    periodStart: row.periodStart ? row.periodStart.toISOString() : null,
    periodEnd: row.periodEnd ? row.periodEnd.toISOString() : null,
    issuedAt: row.issuedAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  };
}

/** Invoices for a company, newest first. */
export async function listInvoicesForCompany(
  companyId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<InvoiceDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const rows = await db
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.companyId, companyId))
    .orderBy(desc(portalInvoices.issuedAt))
    .limit(limit)
    .offset(offset);
  return rows.map(toInvoiceDTO);
}

/** Invoices addressed to a user, newest first. */
export async function listInvoicesForUser(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<InvoiceDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const rows = await db
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.userId, userId))
    .orderBy(desc(portalInvoices.issuedAt))
    .limit(limit)
    .offset(offset);
  return rows.map(toInvoiceDTO);
}

/** One invoice with its line items, scoped to the company that was billed. */
export async function getInvoiceForCompany(
  invoiceId: string,
  scopeCompanyId: string
): Promise<{ invoice: PortalInvoiceRow; items: PortalInvoiceItemRow[] } | null> {
  const { db } = dbFromRequest();
  const [invoice] = await db
    .select()
    .from(portalInvoices)
    .where(and(eq(portalInvoices.id, invoiceId), eq(portalInvoices.companyId, scopeCompanyId)))
    .limit(1);
  if (!invoice) return null;
  const items = await db
    .select()
    .from(portalInvoiceItems)
    .where(eq(portalInvoiceItems.invoiceId, invoice.id))
    .orderBy(portalInvoiceItems.sortOrder);
  return { invoice, items };
}

/** Reads a generated invoice PDF after checking the caller's company-scoped access. */
export async function readInvoicePdfForCompany(
  invoiceId: string,
  companyId: string
): Promise<{ body: Buffer; filename: string; mimeType: string }> {
  const result = await getInvoiceForCompany(invoiceId, companyId);
  if (!result) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested invoice was not found.', 404);
  }
  if (!result.invoice.pdfStorageKey) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'No PDF has been generated for this invoice yet.', 404);
  }

  const body = await getFile(result.invoice.pdfStorageKey);
  return {
    body,
    filename: sanitizeFilename(`${result.invoice.invoiceNumber}.pdf`),
    mimeType: 'application/pdf',
  };
}

/**
 * One invoice with its line items, scoped to the buyer.
 *
 * `scopeUserId` is the caller's user id: an invoice is visible only to the
 * account that was billed, so guessing a UUID never exposes another
 * customer's document.
 */
export async function getInvoiceForUser(
  invoiceId: string,
  scopeUserId: string
): Promise<{ invoice: PortalInvoiceRow; items: PortalInvoiceItemRow[] } | null> {
  const { db } = dbFromRequest();
  const [invoice] = await db
    .select()
    .from(portalInvoices)
    .where(and(eq(portalInvoices.id, invoiceId), eq(portalInvoices.userId, scopeUserId)))
    .limit(1);
  if (!invoice) return null;
  const items = await db
    .select()
    .from(portalInvoiceItems)
    .where(eq(portalInvoiceItems.invoiceId, invoice.id))
    .orderBy(portalInvoiceItems.sortOrder);
  return { invoice, items };
}

/** Reads a generated invoice PDF after checking the caller's user-scoped access. */
export async function readInvoicePdfForUser(
  invoiceId: string,
  userId: string
): Promise<{ body: Buffer; filename: string; mimeType: string }> {
  const { db } = dbFromRequest();
  const [invoice] = await db
    .select()
    .from(portalInvoices)
    .where(and(eq(portalInvoices.id, invoiceId), eq(portalInvoices.userId, userId)))
    .limit(1);
  if (!invoice) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested invoice was not found.', 404);
  }
  if (!invoice.pdfStorageKey) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'No PDF has been generated for this invoice yet.', 404);
  }

  const body = await getFile(invoice.pdfStorageKey);
  return {
    body,
    filename: sanitizeFilename(`${invoice.invoiceNumber}.pdf`),
    mimeType: 'application/pdf',
  };
}
