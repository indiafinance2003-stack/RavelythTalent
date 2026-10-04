import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { addons, companies, jobs, payments, planPromotions, plans } from "@/lib/db/schema";
import { assertSameOrigin, getRequestIp } from "@/lib/security";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import { handleApi, jsonOk, readJson } from "@/lib/http";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { requireCompanyMembership } from "@/lib/entitlements";
import { createRazorpayOrder, publicKeyId } from "@/lib/billing/razorpay";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscriptionBodySchema = z.object({
  planCode: z.string().trim().min(2).max(60),
  billingPeriod: z.enum(["monthly", "yearly"]),
  companyId: z.uuid().optional().nullable(),
  promotionCode: z.string().trim().min(1).max(60).optional(),
});
const addonBodySchema = z.object({
  purpose: z.literal("addon"),
  addonId: z.uuid(),
  companyId: z.uuid(),
  jobId: z.uuid().optional(),
});
const bodySchema = z.union([subscriptionBodySchema, addonBodySchema]);

/** POST /api/billing/order - creates the payment row and a Razorpay Order. */
export const POST = handleApi(async (request: Request) => {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();

  const ip = (await getRequestIp()) ?? "unknown";
  await enforceRateLimit(rateKey("checkout", ip), RATE_LIMITS.checkout);
  await enforceRateLimit(rateKey("checkout", user.id), RATE_LIMITS.checkout);

  const body = bodySchema.parse(await readJson(request));

  if ("purpose" in body && body.purpose === "addon") {
    await requireCompanyMembership(user.id, body.companyId);
    const company = (
      await db
        .select({ status: companies.status })
        .from(companies)
        .where(eq(companies.id, body.companyId))
        .limit(1)
    ).at(0);
    if (company?.status !== "approved") {
      throw new AppError("Your company must be approved to purchase add-ons.", 403, "company_not_approved");
    }

    const addon = (
      await db
        .select()
        .from(addons)
        .where(and(eq(addons.id, body.addonId), eq(addons.isActive, true)))
        .limit(1)
    ).at(0);
    if (!addon || addon.pricePaise === null || addon.pricePaise <= 0) {
      throw new AppError("That add-on is not available for purchase.", 404, "addon_not_found");
    }

    if (addon.type === "per_job") {
      if (!body.jobId) {
        throw new AppError("Choose a job for this add-on.", 400, "job_required");
      }
      const job = (
        await db
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(
              eq(jobs.id, body.jobId),
              eq(jobs.companyId, body.companyId),
              eq(jobs.status, "published"),
            ),
          )
          .limit(1)
      ).at(0);
      if (!job) {
        throw new AppError("Choose a published job belonging to your company.", 404, "job_not_found");
      }
    } else if (body.jobId) {
      throw new AppError("This add-on does not apply to an individual job.", 400, "job_not_allowed");
    }

    const receipt = `rcpt_${Date.now().toString(36)}_${user.id.slice(0, 8)}`;
    const order = await createRazorpayOrder({
      amountPaise: addon.pricePaise,
      receipt,
      notes: {
        userId: user.id,
        companyId: body.companyId,
        addonId: addon.id,
        addonName: addon.name,
        durationDays: String(addon.durationDays),
        jobId: body.jobId ?? "",
        purpose: "addon",
      },
    });

    await db.insert(payments).values({
      userId: user.id,
      companyId: body.companyId,
      addonId: addon.id,
      purpose: "addon",
      orderId: order.id,
      amountPaise: addon.pricePaise,
      currency: "INR",
      status: "created",
      notes: JSON.stringify({
        addonName: addon.name,
        durationDays: addon.durationDays,
        jobId: body.jobId ?? null,
      }),
    });

    return jsonOk({
      keyId: publicKeyId(),
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      purpose: "addon",
      addonName: addon.name,
      companyId: body.companyId,
    });
  }

  const subscription = subscriptionBodySchema.parse(body);
  const plan = (
    await db
      .select()
      .from(plans)
      .where(eq(plans.code, subscription.planCode))
      .limit(1)
  ).at(0);

  if (!plan || !plan.isActive) {
    throw new AppError("That plan is not available.", 404, "plan_not_found");
  }

  let amountPaise =
    subscription.billingPeriod === "yearly" ? plan.priceYearlyPaise : plan.priceMonthlyPaise;
  let promotionCode: string | null = null;
  if (subscription.promotionCode) {
    const promotion = (
      await db
        .select()
        .from(planPromotions)
        .where(
          and(
            eq(planPromotions.planId, plan.id),
            eq(planPromotions.code, subscription.promotionCode),
            eq(planPromotions.billingPeriod, subscription.billingPeriod),
            eq(planPromotions.isActive, true),
            sql`(${planPromotions.startsAt} is null or ${planPromotions.startsAt} <= now())`,
            sql`(${planPromotions.endsAt} is null or ${planPromotions.endsAt} >= now())`,
          ),
        )
        .limit(1)
    ).at(0);
    if (!promotion) {
      throw new AppError("That promotion is no longer available.", 409, "promotion_unavailable");
    }
    promotionCode = promotion.code;
    if (promotion.pricePaise <= 0) {
      throw new AppError("This promotion has an invalid price.", 409, "invalid_promotion");
    }
    amountPaise = promotion.pricePaise;
  }
  const finalAmountPaise = amountPaise;
  if (finalAmountPaise <= 0) {
    throw new AppError("This plan does not require payment.", 400, "free_plan");
  }

  // Employers pay on behalf of their company; membership is verified here.
  let companyId: string | null = null;
  if (plan.audience === "employer") {
    if (!subscription.companyId) {
      throw new AppError("Choose a company to subscribe.", 400, "company_required");
    }
    await requireCompanyMembership(user.id, subscription.companyId);
    const company = (
      await db
        .select({ status: companies.status })
        .from(companies)
        .where(eq(companies.id, subscription.companyId))
        .limit(1)
    ).at(0);
    if (company?.status !== "approved") {
      throw new AppError("Your company must be approved before purchasing an employer plan.", 403, "company_not_approved");
    }
    companyId = subscription.companyId;
  }

  const receipt = `rcpt_${Date.now().toString(36)}_${user.id.slice(0, 8)}`;

  const order = await createRazorpayOrder({
    amountPaise: finalAmountPaise,
    receipt,
    notes: {
      userId: user.id,
      planId: plan.id,
      planCode: plan.code,
      billingPeriod: subscription.billingPeriod,
      promotionCode: promotionCode ?? "",
      companyId: companyId ?? "",
      purpose: "subscription",
    },
  });

  await db.insert(payments).values({
    userId: user.id,
    companyId,
    planId: plan.id,
    purpose: "subscription",
    orderId: order.id,
    amountPaise: finalAmountPaise,
    currency: "INR",
    status: "created",
    notes: JSON.stringify({
      planCode: plan.code,
      billingPeriod: subscription.billingPeriod,
      promotionCode,
    }),
  });

  return jsonOk({
    keyId: publicKeyId(),
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    planCode: plan.code,
    planName: plan.name,
    billingPeriod: subscription.billingPeriod,
    companyId,
  });
});
