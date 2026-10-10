import { and, eq, isNull, sql } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { companies, invoices, payments, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { addonPurchaseEmail } from "@/lib/email/templates/recruiter";
import { invoiceDeliveryEmail } from "@/lib/email/templates/billing";
import { appUrl } from "@/lib/email/urls";
import { getSiteSettings } from "@/lib/settings";
import { ensureBucket } from "@/lib/storage";
import { formatIndianDateTime, formatPaise } from "@/lib/utils";
import { renderInvoicePdf } from "./invoice";
import { financialYear } from "./razorpay";

export type ActivateInternshipPostInput = {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  method?: string | null;
  signatureVerified: boolean;
};

export type InternshipPostActivation = {
  alreadyProcessed: boolean;
  count: number;
  invoiceId: string | null;
  companyId: string;
};

/**
 * Activates a one-time internship-post credit purchase. Mirrors the add-on
 * flow: idempotent (row-locked), credits are granted to the company exactly
 * once, and an invoice + receipt emails are delivered.
 */
export async function activateInternshipPostPayment(
  input: ActivateInternshipPostInput,
): Promise<InternshipPostActivation> {
  const result = await db.transaction(async (tx) => {
    const payment = (
      await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, input.orderId))
        .limit(1)
        .for("update")
    ).at(0);
    if (!payment || payment.purpose !== "internship_post" || !payment.companyId) {
      throw new AppError("Internship credit order not found.", 404, "internship_order_not_found");
    }
    if (payment.amountPaise !== input.amountPaise) {
      throw new AppError("Payment amount does not match the order.", 400, "amount_mismatch");
    }
    if (payment.paymentId && payment.paymentId !== input.paymentId) {
      throw new AppError("Order is already linked to another payment.", 409, "payment_mismatch");
    }

    const count = parseCount(payment.notes);
    const now = new Date();
    const alreadyCaptured = payment.status === "captured";

    const company = (
      await tx
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, payment.companyId))
        .limit(1)
    ).at(0);
    if (!company) throw new AppError("Company not found.", 404, "company_not_found");

    if (!alreadyCaptured) {
      await tx
        .update(companies)
        .set({
          internshipPostCredits: sql`${companies.internshipPostCredits} + ${count}`,
          updatedAt: now,
        })
        .where(eq(companies.id, payment.companyId));
    }

    await tx
      .update(payments)
      .set({
        status: "captured",
        paymentId: input.paymentId,
        signatureVerified: input.signatureVerified,
        method: input.method ?? payment.method,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id));

    const invoice = (
      await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.paymentId, payment.id))
        .limit(1)
    ).at(0);
    let invoiceId = invoice?.id ?? null;
    if (!invoiceId) {
      const [buyer, settings] = await Promise.all([
        tx
          .select({ email: users.email, fullName: users.fullName })
          .from(users)
          .where(eq(users.id, payment.userId))
          .limit(1),
        getSiteSettings(),
      ]);
      if (!buyer[0]) throw new AppError("Payment owner not found.", 404, "user_not_found");

      const taxRate = Number(settings.gstRate ?? "0");
      const taxPaise =
        taxRate > 0 ? Math.round((payment.amountPaise * taxRate) / 100) : 0;
      const sequenceRows = await tx.execute<{ nextval: number }>(
        sql`select nextval('invoice_number_seq') as nextval`,
      );
      const sequence =
        (sequenceRows as unknown as Array<{ nextval: number }>).at(0)?.nextval ?? 1;
      const invoiceNumber = `RAV/${financialYear()}/${String(sequence).padStart(6, "0")}`;
      const [createdInvoice] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          userId: payment.userId,
          companyId: payment.companyId,
          paymentId: payment.id,
          planName: count === 1 ? "Internship post credit" : `${count} internship post credits`,
          customerName: buyer[0].fullName,
          customerEmail: buyer[0].email,
          gstin: settings.gstin ?? null,
          subtotalPaise: payment.amountPaise,
          taxRate: settings.gstRate ?? "0",
          taxPaise,
          totalPaise: payment.amountPaise + taxPaise,
          currency: "INR",
          periodStart: now,
          periodEnd: now,
          status: "paid",
        })
        .returning({ id: invoices.id });
      invoiceId = createdInvoice!.id;
    }

    return {
      alreadyProcessed: alreadyCaptured,
      count,
      invoiceId,
      userId: payment.userId,
      companyId: payment.companyId,
      amountPaise: payment.amountPaise,
      orderId: input.orderId,
    };
  });

  await deliverInternshipReceipt(result);
  return {
    alreadyProcessed: result.alreadyProcessed,
    count: result.count,
    invoiceId: result.invoiceId,
    companyId: result.companyId,
  };
}

function parseCount(raw: string | null): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "{}");
  } catch {
    throw new AppError("Internship order details are invalid.", 500, "invalid_internship_order");
  }
  const count = Number((parsed as { count?: unknown }).count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new AppError("Internship credit count is invalid.", 500, "invalid_internship_order");
  }
  return count;
}

async function deliverInternshipReceipt(params: {
  invoiceId: string | null;
  count: number;
  userId: string;
  amountPaise: number;
  orderId: string;
}): Promise<void> {
  if (!params.invoiceId) return;
  try {
    const [invoice, user, settings] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1),
      db
        .select({ email: users.email, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, params.userId))
        .limit(1),
      getSiteSettings(),
    ]);
    const row = invoice[0];
    const recipient = user[0];
    if (!row || !recipient) return;

    if (!row.pdfPath) {
      const address = [
        settings.addressLine1,
        settings.addressLine2,
        settings.city,
        settings.state,
        settings.postalCode,
        settings.country,
      ]
        .filter(Boolean)
        .join(", ");
      const pdf = await renderInvoicePdf({
        invoiceNumber: row.invoiceNumber,
        issuedOn: formatIndianDateTime(row.issuedAt),
        sellerName: settings.legalCompanyName ?? settings.brandName,
        sellerGstin: settings.gstin,
        sellerAddress: address || null,
        buyerName: row.customerName,
        buyerEmail: row.customerEmail,
        planName: row.planName,
        description: `Internship post credits`,
        subtotalPaise: row.subtotalPaise,
        taxRate: row.taxRate,
        taxPaise: row.taxPaise,
        totalPaise: row.totalPaise,
        currency: row.currency,
        periodStart: row.periodStart ? formatIndianDateTime(row.periodStart) : "",
        periodEnd: row.periodEnd ? formatIndianDateTime(row.periodEnd) : "",
        orderId: params.orderId,
      });
      const directory = await ensureBucket("invoices");
      const filename = `internship-${row.id}.pdf`;
      await writeFile(path.join(directory, filename), pdf, { mode: 0o640 });
      await db
        .update(invoices)
        .set({ pdfPath: `invoices/${filename}` })
        .where(and(eq(invoices.id, row.id), isNull(invoices.pdfPath)));
    }

    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: recipient.email,
      toName: recipient.fullName,
      templateKey: "addon_purchase",
      rendered: addonPurchaseEmail({
        ownerName: recipient.fullName.split(" ")[0] ?? "there",
        addonName:
          params.count === 1
            ? "Internship post credit"
            : `${params.count} internship post credits`,
        amount: formatPaise(params.amountPaise),
        brand,
      }),
      metadata: { invoiceId: row.id },
    });
    await queueRenderedEmail({
      to: recipient.email,
      toName: recipient.fullName,
      templateKey: "invoice",
      rendered: invoiceDeliveryEmail({
        name: recipient.fullName.split(" ")[0] ?? "there",
        invoiceNumber: row.invoiceNumber,
        planName: row.planName,
        amount: formatPaise(row.totalPaise),
        issuedOn: formatIndianDateTime(row.issuedAt),
        gstNote: Number(row.taxRate) > 0 ? `${row.taxRate}%` : null,
        downloadUrl: appUrl("/recruiter/billing"),
        hasAttachment: false,
        brand,
      }),
      metadata: { invoiceId: row.id },
    });
  } catch (error) {
    console.error("[billing] internship credit invoice or email delivery failed:", error);
  }
}