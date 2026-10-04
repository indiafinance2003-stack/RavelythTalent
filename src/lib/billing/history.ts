import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoices,
  payments,
  plans,
  subscriptions,
} from "@/lib/db/schema";

/**
 * Billing history for the account pages (candidate or employer scoped by
 * `companyId`). Everything here is read-only presentation data.
 */

export type SubscriptionRow = {
  id: string;
  status: string;
  planName: string;
  billingPeriod: "monthly" | "yearly";
  amountPaise: number;
  startedAt: Date;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
};

export type PaymentRow = {
  id: string;
  orderId: string;
  paymentId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
  method: string | null;
  failureReason: string | null;
  createdAt: Date;
};

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  planName: string;
  totalPaise: number;
  taxPaise: number;
  status: string;
  issuedAt: Date;
  hasPdf: boolean;
};

export async function listSubscriptions(
  userId: string,
  companyId: string | null,
): Promise<SubscriptionRow[]> {
  const rows = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      planName: plans.name,
      billingPeriod: subscriptions.billingPeriod,
      amountPaise: subscriptions.amountPaise,
      startedAt: subscriptions.startedAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelledAt: subscriptions.cancelledAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      companyId
        ? and(eq(subscriptions.userId, userId), eq(subscriptions.companyId, companyId))
        : and(eq(subscriptions.userId, userId), isNull(subscriptions.companyId)),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(50);

  return rows;
}

export async function listPayments(
  userId: string,
  companyId: string | null,
): Promise<PaymentRow[]> {
  return db
    .select({
      id: payments.id,
      orderId: payments.orderId,
      paymentId: payments.paymentId,
      amountPaise: payments.amountPaise,
      currency: payments.currency,
      status: payments.status,
      method: payments.method,
      failureReason: payments.failureReason,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(
      companyId
        ? and(eq(payments.userId, userId), eq(payments.companyId, companyId))
        : and(eq(payments.userId, userId), isNull(payments.companyId)),
    )
    .orderBy(desc(payments.createdAt))
    .limit(50);
}

export async function listInvoices(
  userId: string,
  companyId: string | null,
): Promise<InvoiceRow[]> {
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      planName: invoices.planName,
      totalPaise: invoices.totalPaise,
      taxPaise: invoices.taxPaise,
      status: invoices.status,
      issuedAt: invoices.issuedAt,
      pdfPath: invoices.pdfPath,
    })
    .from(invoices)
    .where(
      companyId
        ? and(eq(invoices.userId, userId), eq(invoices.companyId, companyId))
        : and(eq(invoices.userId, userId), isNull(invoices.companyId)),
    )
    .orderBy(desc(invoices.issuedAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    planName: r.planName,
    totalPaise: r.totalPaise,
    taxPaise: r.taxPaise,
    status: r.status,
    issuedAt: r.issuedAt,
    hasPdf: Boolean(r.pdfPath),
  }));
}

/** Loads an invoice only for its account owner or an administrator. */
export async function findOwnedInvoice(
  invoiceId: string,
  userId: string,
  role: string,
): Promise<{
  id: string;
  invoiceNumber: string;
  pdfPath: string | null;
  totalPaise: number;
} | null> {
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      pdfPath: invoices.pdfPath,
      totalPaise: invoices.totalPaise,
      invoiceUserId: invoices.userId,
      companyId: invoices.companyId,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  const invoice = rows.at(0);
  if (!invoice) return null;

  if (invoice.invoiceUserId !== userId && role !== "admin") return null;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    pdfPath: invoice.pdfPath,
    totalPaise: invoice.totalPaise,
  };
}
