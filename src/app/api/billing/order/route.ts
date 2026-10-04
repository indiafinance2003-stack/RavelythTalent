import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { assertSameOrigin, getRequestIp } from "@/lib/security";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import { handleApi, jsonOk, readJson } from "@/lib/http";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { requireCompanyMembership } from "@/lib/entitlements";
import { payments } from "@/lib/db/schema";
import { createRazorpayOrder, publicKeyId } from "@/lib/billing/razorpay";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  planCode: z.string().trim().min(2).max(60),
  billingPeriod: z.enum(["monthly", "yearly"]),
  companyId: z.uuid().optional().nullable(),
});

/** POST /api/billing/order - creates the payment row and a Razorpay Order. */
export const POST = handleApi(async (request: Request) => {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();

  const ip = (await getRequestIp()) ?? "unknown";
  await enforceRateLimit(rateKey("checkout", ip), RATE_LIMITS.checkout);
  await enforceRateLimit(rateKey("checkout", user.id), RATE_LIMITS.checkout);

  const body = bodySchema.parse(await readJson(request));

  const plan = (
    await db
      .select()
      .from(plans)
      .where(eq(plans.code, body.planCode))
      .limit(1)
  ).at(0);

  if (!plan || !plan.isActive) {
    throw new AppError("That plan is not available.", 404, "plan_not_found");
  }

  const amountPaise =
    body.billingPeriod === "yearly" ? plan.priceYearlyPaise : plan.priceMonthlyPaise;
  if (amountPaise <= 0) {
    throw new AppError("This plan does not require payment.", 400, "free_plan");
  }

  // Employers pay on behalf of their company; membership is verified here.
  let companyId: string | null = null;
  if (plan.audience === "employer") {
    if (!body.companyId) {
      throw new AppError("Choose a company to subscribe.", 400, "company_required");
    }
    await requireCompanyMembership(user.id, body.companyId);
    companyId = body.companyId;
  }

  const receipt = `rcpt_${Date.now().toString(36)}_${user.id.slice(0, 8)}`;

  const order = await createRazorpayOrder({
    amountPaise,
    receipt,
    notes: {
      userId: user.id,
      planId: plan.id,
      planCode: plan.code,
      billingPeriod: body.billingPeriod,
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
    amountPaise,
    currency: "INR",
    status: "created",
    notes: JSON.stringify({
      planCode: plan.code,
      billingPeriod: body.billingPeriod,
    }),
  });

  return jsonOk({
    keyId: publicKeyId(),
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    planCode: plan.code,
    planName: plan.name,
    billingPeriod: body.billingPeriod,
    companyId,
  });
});
