import { and, eq, isNull, sql } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import {
  addonPurchases,
  addons,
  invoices,
  payments,
  users,
} from "@/lib/db/schema";
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

export type ActivateAddonInput = {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  method?: string | null;
  signatureVerified: boolean;
};

export async function activateAddonPayment(
  input: ActivateAddonInput,
): Promise<{ alreadyProcessed: boolean; purchaseId: string }> {
  const result = await db.transaction(async (tx) => {
    const payment = (
      await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, input.orderId))
        .limit(1)
        .for("update")
    ).at(0);
    if (!payment || payment.purpose !== "addon" || !payment.addonId) {
      throw new AppError("Add-on order not found.", 404, "addon_order_not_found");
    }
    if (payment.amountPaise !== input.amountPaise) {
      throw new AppError("Payment amount does not match the order.", 400, "amount_mismatch");
    }
    if (payment.paymentId && payment.paymentId !== input.paymentId) {
      throw new AppError("Order is already linked to another payment.", 409, "payment_mismatch");
    }

    const addon = (
      await tx.select().from(addons).where(eq(addons.id, payment.addonId)).limit(1)
    ).at(0);
    if (!addon) throw new AppError("Add-on no longer exists.", 404, "addon_not_found");

    const notes = parseAddonNotes(payment.notes, addon.durationDays);
    const existingPurchase = (
      await tx
        .select({ id: addonPurchases.id })
        .from(addonPurchases)
        .where(eq(addonPurchases.paymentId, payment.id))
        .limit(1)
    ).at(0);
    const now = new Date();
    const purchaseId =
      existingPurchase?.id ??
      (
        await tx
          .insert(addonPurchases)
          .values({
            addonId: addon.id,
            userId: payment.userId,
            companyId: payment.companyId,
            jobId: notes.jobId ?? null,
            paymentId: payment.id,
            status: "active",
            startsAt: now,
            expiresAt: new Date(now.getTime() + notes.durationDays * 86_400_000),
          })
          .returning({ id: addonPurchases.id })
      )[0]!.id;

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
      const taxPaise = taxRate > 0
        ? Math.round((payment.amountPaise * taxRate) / 100)
        : 0;
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
          planName: notes.addonName || addon.name,
          customerName: buyer[0].fullName,
          customerEmail: buyer[0].email,
          gstin: settings.gstin ?? null,
          subtotalPaise: payment.amountPaise,
          taxRate: settings.gstRate ?? "0",
          taxPaise,
          totalPaise: payment.amountPaise + taxPaise,
          currency: "INR",
          periodStart: now,
          periodEnd: new Date(now.getTime() + notes.durationDays * 86_400_000),
          status: "paid",
        })
        .returning({ id: invoices.id });
      invoiceId = createdInvoice!.id;
    }

    return {
      alreadyProcessed: payment.status === "captured" && Boolean(existingPurchase),
      purchaseId,
      invoiceId,
      addonName: notes.addonName || addon.name,
      userId: payment.userId,
      amountPaise: payment.amountPaise,
      orderId: input.orderId,
    };
  });

  await deliverAddonReceipt(result);
  return {
    alreadyProcessed: result.alreadyProcessed,
    purchaseId: result.purchaseId,
  };
}

function parseAddonNotes(
  raw: string | null,
  fallbackDuration: number,
): { addonName: string; durationDays: number; jobId: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "{}");
  } catch {
    throw new AppError("Add-on order details are invalid.", 500, "invalid_addon_order");
  }
  const notes = parsed as {
    addonName?: unknown;
    durationDays?: unknown;
    jobId?: unknown;
  };
  const durationDays = Number(notes.durationDays ?? fallbackDuration);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
    throw new AppError("Add-on duration is invalid.", 500, "invalid_addon_order");
  }
  return {
    addonName: typeof notes.addonName === "string" ? notes.addonName : "",
    durationDays,
    jobId: typeof notes.jobId === "string" ? notes.jobId : null,
  };
}

async function deliverAddonReceipt(params: {
  invoiceId: string | null;
  addonName: string;
  userId: string;
  amountPaise: number;
  orderId: string;
}): Promise<void> {
  if (!params.invoiceId) return;
  try {
    const [invoice, user, settings] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1),
      db.select({ email: users.email, fullName: users.fullName }).from(users)
        .where(eq(users.id, params.userId)).limit(1),
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
      ].filter(Boolean).join(", ");
      const pdf = await renderInvoicePdf({
        invoiceNumber: row.invoiceNumber,
        issuedOn: formatIndianDateTime(row.issuedAt),
        sellerName: settings.legalCompanyName ?? settings.brandName,
        sellerGstin: settings.gstin,
        sellerAddress: address || null,
        buyerName: row.customerName,
        buyerEmail: row.customerEmail,
        planName: row.planName,
        description: `${row.planName} add-on`,
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
      const filename = `addon-${row.id}.pdf`;
      await writeFile(path.join(directory, filename), pdf, { mode: 0o640 });
      await db.update(invoices)
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
        addonName: params.addonName,
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
    console.error("[billing] add-on invoice or email delivery failed:", error);
  }
}
