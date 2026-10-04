import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  invoices,
  payments,
  plans,
  subscriptions,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getSiteSettings } from "@/lib/settings";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import {
  invoiceDeliveryEmail,
  paymentSuccessEmail,
  subscriptionActivatedEmail,
} from "@/lib/email/templates/billing";
import { appUrl } from "@/lib/email/urls";
import { ensureBucket } from "@/lib/storage";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { financialYear } from "./razorpay";
import { renderInvoicePdf } from "./invoice";

/**
 * Turns a verified payment into an active subscription.
 *
 * IDEMPOTENT: the caller may be the browser (`/api/billing/verify`) or the
 * Razorpay webhook. Both funnel through here, and a payment that already has a
 * subscription attached is never activated twice - so a closed browser cannot
 * lose a payment and a replayed webhook cannot double-grant a plan.
 */

export type ActivateInput = {
  orderId: string;
  paymentId: string | null;
  amountPaise: number;
  userId: string;
  companyId: string | null;
  planId: string;
  billingPeriod: "monthly" | "yearly";
  method?: string | null;
  signatureVerified: boolean;
};

export type ActivateResult = {
  alreadyProcessed: boolean;
  subscriptionId: string | null;
  invoiceId: string | null;
};

export function periodEndFor(from: Date, period: "monthly" | "yearly"): Date {
  const end = new Date(from);
  if (period === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export async function activateSubscription(input: ActivateInput): Promise<ActivateResult> {
  const existingPayment = (
    await db
      .select()
      .from(payments)
      .where(
        input.paymentId
          ? sql`(${payments.orderId} = ${input.orderId} or ${payments.paymentId} = ${input.paymentId})`
          : eq(payments.orderId, input.orderId),
      )
      .limit(1)
  ).at(0);

  if (existingPayment?.subscriptionId && existingPayment.status === "captured") {
    return {
      alreadyProcessed: true,
      subscriptionId: existingPayment.subscriptionId,
      invoiceId: null,
    };
  }

  const now = new Date();
  const periodEnd = periodEndFor(now, input.billingPeriod);

  // Upgrade/downgrade rule: the previous subscription ends immediately and is
  // NOT prorated or refunded (documented in ASSUMPTIONS.md).
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(
      and(
        input.companyId
          ? eq(subscriptions.companyId, input.companyId)
          : sql`${subscriptions.companyId} is null`,
        eq(subscriptions.userId, input.userId),
        eq(subscriptions.status, "active"),
      ),
    );

  const subscriptionRows = await db
    .insert(subscriptions)
    .values({
      userId: input.userId,
      companyId: input.companyId,
      planId: input.planId,
      status: "active",
      billingPeriod: input.billingPeriod,
      amountPaise: input.amountPaise,
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    })
    .returning({ id: subscriptions.id });
  const subscriptionId = subscriptionRows[0]!.id;

  if (existingPayment) {
    await db
      .update(payments)
      .set({
        status: "captured",
        paymentId: input.paymentId ?? existingPayment.paymentId,
        subscriptionId,
        signatureVerified: input.signatureVerified,
        method: input.method ?? existingPayment.method,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, existingPayment.id));
  } else {
    await db.insert(payments).values({
      userId: input.userId,
      companyId: input.companyId,
      planId: input.planId,
      subscriptionId,
      purpose: "subscription",
      orderId: input.orderId,
      paymentId: input.paymentId,
      amountPaise: input.amountPaise,
      currency: "INR",
      status: "captured",
      method: input.method ?? null,
      signatureVerified: input.signatureVerified,
    });
  }

  const invoiceId = await createInvoiceForSubscription({
    subscriptionId,
    orderId: input.orderId,
  });

  await sendPaymentEmails(input, subscriptionId, invoiceId, periodEnd);

  return { alreadyProcessed: false, subscriptionId, invoiceId };
}

async function sendPaymentEmails(
  input: ActivateInput,
  subscriptionId: string,
  invoiceId: string | null,
  periodEnd: Date,
): Promise<void> {
  const user = (
    await db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)
  ).at(0);
  const plan = (
    await db.select({ name: plans.name }).from(plans).where(eq(plans.id, input.planId)).limit(1)
  ).at(0);

  if (!user || !plan) return;

  const brand = await getEmailBrand();
  const name = user.fullName.split(" ")[0] ?? "there";
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(input.amountPaise / 100);

  await queueRenderedEmail({
    to: user.email,
    toName: user.fullName,
    templateKey: "payment_success",
    rendered: paymentSuccessEmail({
      name,
      planName: plan.name,
      amount,
      orderId: input.orderId,
      brand,
    }),
    metadata: { subscriptionId },
  });

  await queueRenderedEmail({
    to: user.email,
    toName: user.fullName,
    templateKey: "subscription_activated",
    rendered: subscriptionActivatedEmail({
      name,
      planName: plan.name,
      periodLabel: input.billingPeriod === "yearly" ? "1 year" : "1 month",
      endsOn: periodEnd.toLocaleDateString("en-IN"),
      manageUrl: appUrl(
        input.companyId ? "/recruiter/billing" : "/dashboard/billing",
      ),
      brand,
    }),
    metadata: { subscriptionId },
  });
}

async function createInvoiceForSubscription(params: {
  subscriptionId: string;
  orderId: string;
}): Promise<string | null> {
  const subscription = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, params.subscriptionId))
      .limit(1)
  ).at(0);
  if (!subscription) return null;

  const user = (
    await db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, subscription.userId))
      .limit(1)
  ).at(0);
  const plan = (
    await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1)
  ).at(0);
  if (!user || !plan) return null;

  const settings = await getSiteSettings();

  const taxRate = Number(settings.gstRate ?? "0");
  const taxPaise =
    taxRate > 0 ? Math.round((subscription.amountPaise * taxRate) / 100) : 0;
  const totalPaise = subscription.amountPaise + taxPaise;

  const seqRows = await db.execute<{ nextval: number }>(
    sql`select nextval('invoice_number_seq') as nextval`,
  );
  const sequence =
    (seqRows as unknown as Array<{ nextval: number }>).at(0)?.nextval ?? 1;
  const invoiceNumber = `RAV/${financialYear()}/${String(sequence).padStart(6, "0")}`;

  const addressLine = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
    settings.country,
  ]
    .filter(Boolean)
    .join(", ");

  const invoiceRows = await db
    .insert(invoices)
    .values({
      invoiceNumber,
      userId: subscription.userId,
      companyId: subscription.companyId,
      subscriptionId: subscription.id,
      planName: plan.name,
      customerName: user.fullName,
      customerEmail: user.email,
      gstin: settings.gstin ?? null,
      subtotalPaise: subscription.amountPaise,
      taxRate: settings.gstRate ?? "0",
      taxPaise,
      totalPaise,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      status: "paid",
    })
    .returning({ id: invoices.id });
  const invoiceId = invoiceRows[0]!.id;

  try {
    const buffer = await renderInvoicePdf({
      invoiceNumber,
      issuedOn: new Date().toLocaleDateString("en-IN"),
      sellerName: settings.legalCompanyName ?? settings.brandName,
      sellerGstin: settings.gstin,
      sellerAddress: addressLine || null,
      buyerName: user.fullName,
      buyerEmail: user.email,
      planName: plan.name,
      description: `${plan.name} subscription (${subscription.billingPeriod})`,
      subtotalPaise: subscription.amountPaise,
      taxRate: settings.gstRate ?? "0",
      taxPaise,
      totalPaise,
      currency: "INR",
      periodStart: subscription.currentPeriodStart.toLocaleDateString("en-IN"),
      periodEnd: subscription.currentPeriodEnd.toLocaleDateString("en-IN"),
      orderId: params.orderId,
    });

    const dir = await ensureBucket("invoices");
    const fileName = `${invoiceNumber.replace(/[^A-Za-z0-9]/g, "-")}-${randomBytes(4).toString("hex")}.pdf`;
    await writeFile(path.join(dir, fileName), buffer, { mode: 0o640 });

    await db
      .update(invoices)
      .set({ pdfPath: `invoices/${fileName}` })
      .where(eq(invoices.id, invoiceId));
  } catch (error) {
    // A missing PDF must never lose the subscription or the payment.
    console.error("[billing] invoice PDF failed:", error);
    return invoiceId;
  }

  const brand = await getEmailBrand();
  await queueRenderedEmail({
    to: user.email,
    toName: user.fullName,
    templateKey: "invoice",
    rendered: invoiceDeliveryEmail({
      name: user.fullName.split(" ")[0] ?? "there",
      invoiceNumber,
      planName: plan.name,
      amount: new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(totalPaise / 100),
      issuedOn: new Date().toLocaleDateString("en-IN"),
      gstNote:
        taxRate > 0 ? `${taxRate}% on ${settings.gstin ?? "GSTIN not set"}` : null,
      downloadUrl: appUrl(`/dashboard/billing`),
      hasAttachment: false,
      brand,
    }),
    metadata: { invoiceId },
  });

  return invoiceId;
}

/** Records a failed payment attempt (surfaced in admin + emailed). */
export async function recordFailedPayment(params: {
  orderId: string;
  userId: string;
  amountPaise: number;
  reason?: string | null;
}): Promise<void> {
  const existing = (
    await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orderId, params.orderId))
      .limit(1)
  ).at(0);

  if (existing) {
    await db
      .update(payments)
      .set({ status: "failed", failureReason: params.reason ?? null, updatedAt: new Date() })
      .where(eq(payments.id, existing.id));
    return;
  }

  await db.insert(payments).values({
    userId: params.userId,
    purpose: "subscription",
    orderId: params.orderId,
    amountPaise: params.amountPaise,
    status: "failed",
    failureReason: params.reason ?? null,
  });
}

export async function companyNameFor(companyId: string): Promise<string> {
  const rows = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return rows.at(0)?.name ?? "company";
}

export { AppError };
