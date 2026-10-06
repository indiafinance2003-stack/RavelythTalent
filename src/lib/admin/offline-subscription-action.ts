"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { createInvoiceForSubscription, periodEndFor, sendPaymentEmails } from "@/lib/billing/activate";
import { db } from "@/lib/db";
import { auditLogs, companies, payments, plans, subscriptions, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import {
  assertOfflinePlanOwner,
  paidPriceForPeriod,
} from "@/lib/admin/offline-subscription-validation";

const formSchema = z.object({
  target: z.string().refine((target) => {
    const [type, id, ...extra] = target.split(":");
    return extra.length === 0 &&
      (type === "candidate" || type === "company") &&
      z.uuid().safeParse(id).success;
  }, "Choose a valid candidate or company."),
  planId: z.uuid(),
  billingPeriod: z.enum(["monthly", "yearly"]),
  startDate: z.iso.date(),
  mode: z.enum(["grant", "extend"]),
  paymentReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  generateInvoice: z.boolean(),
});

function parseStartDate(date: string): Date {
  const value = new Date(`${date}T00:00:00+05:30`);
  if (!Number.isFinite(value.getTime())) throw new AppError("Choose a valid start date.", 422);
  return value;
}

async function grantOfflineSubscriptionActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = formSchema.safeParse({
    target: formData.get("target"),
    planId: formData.get("planId"),
    billingPeriod: formData.get("billingPeriod"),
    startDate: formData.get("startDate"),
    mode: formData.get("mode"),
    paymentReference: String(formData.get("paymentReference") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    generateInvoice: formData.get("generateInvoice") === "on",
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid activation details.", 422);
  }

  const value = parsed.data;
  const [targetType, targetId] = value.target.split(":") as ["candidate" | "company", string];
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, value.planId), eq(plans.isActive, true))).limit(1);
  assertOfflinePlanOwner(plan, targetType);
  const amountPaise = paidPriceForPeriod(plan, value.billingPeriod);

  let userId: string;
  let companyId: string | null = null;
  if (targetType === "candidate") {
    const [user] = await db.select({ id: users.id, role: users.role })
      .from(users).where(eq(users.id, targetId)).limit(1);
    if (!user || user.role !== "job_seeker") throw new AppError("Candidate account not found.", 404, "not_found");
    userId = user.id;
  } else {
    const [company] = await db.select({ id: companies.id, ownerUserId: companies.ownerUserId })
      .from(companies)
      .where(and(eq(companies.id, targetId), isNull(companies.deletedAt)))
      .limit(1);
    if (!company) throw new AppError("Company not found.", 404, "not_found");
    userId = company.ownerUserId;
    companyId = company.id;
  }

  const requestedStart = parseStartDate(value.startDate);
  const now = new Date();
  const scope = and(
    eq(subscriptions.userId, userId),
    companyId ? eq(subscriptions.companyId, companyId) : isNull(subscriptions.companyId),
    eq(subscriptions.status, "active"),
    gt(subscriptions.currentPeriodEnd, now),
  );
  const active = await db.select().from(subscriptions).where(scope).orderBy(sql`${subscriptions.currentPeriodEnd} desc`).limit(1);

  let startsAt = requestedStart;
  if (value.mode === "extend") {
    const current = active[0];
    if (!current || current.planId !== plan.id) {
      throw new AppError("To extend, choose the current plan for an account with an active subscription.", 409);
    }
    if (current.currentPeriodEnd > startsAt) startsAt = current.currentPeriodEnd;
  }
  const endsAt = periodEndFor(startsAt, value.billingPeriod);
  const offlineOrderId = `offline_${randomUUID()}`;
  const paymentNotes = JSON.stringify({
    paymentReference: value.paymentReference ?? null,
    adminNotes: value.notes ?? null,
    activatedBy: admin.id,
  });

  const created = await db.transaction(async (tx) => {
    if (value.mode === "grant") {
      for (const current of active) {
        if (current.currentPeriodStart >= startsAt || startsAt <= now) {
          await tx.update(subscriptions)
            .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
            .where(eq(subscriptions.id, current.id));
        } else if (current.currentPeriodEnd > startsAt) {
          await tx.update(subscriptions)
            .set({ currentPeriodEnd: startsAt, updatedAt: now })
            .where(eq(subscriptions.id, current.id));
        }
      }
    }

    const [subscription] = await tx.insert(subscriptions).values({
      userId,
      companyId,
      planId: plan.id,
      status: "active",
      billingPeriod: value.billingPeriod,
      amountPaise,
      startedAt: startsAt,
      currentPeriodStart: startsAt,
      currentPeriodEnd: endsAt,
    }).returning({ id: subscriptions.id });
    if (!subscription) throw new AppError("Could not create the subscription.", 500);

    const [payment] = await tx.insert(payments).values({
      userId,
      companyId,
      subscriptionId: subscription.id,
      planId: plan.id,
      purpose: "subscription",
      orderId: offlineOrderId,
      amountPaise,
      currency: "INR",
      status: "captured",
      method: "offline",
      signatureVerified: false,
      notes: paymentNotes,
    }).returning({ id: payments.id });
    if (!payment) throw new AppError("Could not record the offline payment.", 500);

    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: "subscription.offline_activated",
      entityType: "subscription",
      entityId: subscription.id,
      description: `Offline ${value.mode} of ${plan.name} for ${companyId ? "company" : "candidate"} ${targetId}; reference ${value.paymentReference || "not provided"}.`,
      metadata: {
        paymentId: payment.id,
        paymentReference: value.paymentReference ?? null,
        notes: value.notes ?? null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    });
    return { subscriptionId: subscription.id, paymentId: payment.id };
  });

  let invoiceId: string | null = null;
  if (value.generateInvoice) {
    invoiceId = await createInvoiceForSubscription({
      subscriptionId: created.subscriptionId,
      orderId: offlineOrderId,
      paymentId: created.paymentId,
    });
  }
  await sendPaymentEmails({
    orderId: offlineOrderId,
    paymentId: null,
    amountPaise,
    userId,
    companyId,
    planId: plan.id,
    billingPeriod: value.billingPeriod,
    method: "offline",
    signatureVerified: false,
  }, created.subscriptionId, invoiceId, endsAt, false, startsAt);

  revalidatePath("/admin/billing");
  revalidatePath(companyId ? "/recruiter/billing" : "/dashboard/billing");
  redirect("/admin/billing?activated=1");
}

export async function grantOfflineSubscriptionAction(formData: FormData): Promise<void> {
  await runAdminFormAction("/admin/billing", () => grantOfflineSubscriptionActionImpl(formData));
}
