import { AppError } from "@/lib/errors";

export function assertOfflinePlanOwner(
  plan: { audience: string; isActive: boolean } | undefined,
  targetType: "candidate" | "company",
): void {
  const expectedAudience = targetType === "company" ? "employer" : "candidate";
  if (!plan?.isActive || plan.audience !== expectedAudience) {
    throw new AppError("Choose an active plan that matches the subscription owner.", 422, "plan_owner_mismatch");
  }
}

export function paidPriceForPeriod(
  plan: { priceMonthlyPaise: number; priceYearlyPaise: number },
  billingPeriod: "monthly" | "yearly",
): number {
  const amountPaise = billingPeriod === "yearly"
    ? plan.priceYearlyPaise
    : plan.priceMonthlyPaise;
  if (amountPaise <= 0) {
    throw new AppError(`The selected plan does not have a paid ${billingPeriod} price.`, 422, "plan_price_unavailable");
  }
  return amountPaise;
}
