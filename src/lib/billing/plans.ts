import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { planFeatures, planPromotions, plans } from "@/lib/db/schema";

/** Public plan catalogue with entitlements and any active promotion. */

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  audience: "candidate" | "employer";
  description: string | null;
  priceMonthlyPaise: number;
  priceYearlyPaise: number;
  jobPostsPerMonth: number | null;
  isFeatured: boolean;
  features: Array<{ key: string; label: string | null; enabled: boolean; limit: number | null }>;
  promotion: {
    code: string;
    label: string;
    pricePaise: number;
    billingPeriod: "monthly" | "yearly";
    bannerText: string | null;
  } | null;
};

export async function listPublicPlans(audience?: "candidate" | "employer"): Promise<PublicPlan[]> {
  const planRows = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));

  const filtered = audience
    ? planRows.filter((p) => p.audience === audience)
    : planRows;
  if (filtered.length === 0) return [];

  const ids = filtered.map((p) => p.id);

  const [featureRows, promoRows] = await Promise.all([
    db
      .select()
      .from(planFeatures)
      .where(sql`${planFeatures.planId} in ${ids}`),
    db
      .select()
      .from(planPromotions)
      .where(
        sql`${planPromotions.planId} in ${ids}
             and ${planPromotions.isActive} = true
             and (${planPromotions.startsAt} is null or ${planPromotions.startsAt} <= now())
             and (${planPromotions.endsAt} is null or ${planPromotions.endsAt} >= now())`,
      ),
  ]);

  return filtered.map((plan) => {
    const promotion = promoRows.find((p) => p.planId === plan.id) ?? null;
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      audience: plan.audience,
      description: plan.description,
      priceMonthlyPaise: plan.priceMonthlyPaise,
      priceYearlyPaise: plan.priceYearlyPaise,
      jobPostsPerMonth: plan.jobPostsPerMonth,
      isFeatured: plan.isFeatured,
      features: featureRows
        .filter((f) => f.planId === plan.id)
        .map((f) => ({
          key: f.featureKey,
          label: f.label,
          enabled: f.isEnabled,
          limit: f.limitValue,
        })),
      promotion: promotion
        ? {
            code: promotion.code,
            label: promotion.label,
            pricePaise: promotion.pricePaise,
            billingPeriod: promotion.billingPeriod,
            bannerText: promotion.bannerText,
          }
        : null,
    };
  });
}

export async function getPlanByCode(code: string) {
  const rows = await db.select().from(plans).where(eq(plans.code, code)).limit(1);
  return rows.at(0) ?? null;
}

/** Yearly saving as a percentage of twelve months of the monthly price. */
export function yearlySavingPercent(monthlyPaise: number, yearlyPaise: number): number {
  if (monthlyPaise <= 0) return 0;
  const twelveMonths = monthlyPaise * 12;
  if (twelveMonths <= yearlyPaise) return 0;
  return Math.round(((twelveMonths - yearlyPaise) / twelveMonths) * 100);
}
