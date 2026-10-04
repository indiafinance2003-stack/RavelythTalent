import { eq } from "drizzle-orm";
import {
  addons,
  categories,
  planFeatures,
  planPromotions,
  plans,
  siteSettings,
  skills,
} from "@/lib/db/schema";
import { slugify } from "@/lib/utils";
import { closeDb, db, log } from "./script-db";
import {
  ADDON_SEED,
  CATEGORY_SEED,
  PLAN_PROMOTION_SEED,
  PLAN_SEED,
  SKILL_SEED,
} from "./seed-data";

/**
 * Idempotent reference-data seed: plans, entitlements, the candidate launch
 * promotion, India-focused categories, the skill vocabulary, configurable
 * add-ons (inactive, no prices) and the site_settings singleton.
 *
 * Never overwrites values an administrator has already edited.
 */

async function seedPlans(): Promise<void> {
  for (const plan of PLAN_SEED) {
    const rows = await db
      .insert(plans)
      .values({
        code: plan.code,
        name: plan.name,
        audience: plan.audience,
        description: plan.description,
        priceMonthlyPaise: plan.priceMonthlyPaise,
        priceYearlyPaise: plan.priceYearlyPaise,
        jobPostsPerMonth: plan.jobPostsPerMonth,
        isFeatured: plan.isFeatured ?? false,
        sortOrder: plan.sortOrder,
      })
      .onConflictDoNothing({ target: plans.code })
      .returning({ id: plans.id });

    let planId = rows.at(0)?.id;
    if (!planId) {
      const existing = await db
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.code, plan.code))
        .limit(1);
      planId = existing.at(0)?.id;
    }
    if (!planId) throw new Error(`Could not resolve plan id for ${plan.code}`);

    for (const feature of plan.features) {
      await db
        .insert(planFeatures)
        .values({
          planId,
          featureKey: feature.featureKey,
          label: feature.label,
          isEnabled: feature.isEnabled,
          limitValue: feature.limitValue,
        })
        .onConflictDoNothing({
          target: [planFeatures.planId, planFeatures.featureKey],
        });
    }
  }
  log(`plans: ${PLAN_SEED.length} plans and their entitlements ensured`);
}

async function seedPromotion(): Promise<void> {
  const plan = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, PLAN_PROMOTION_SEED.planCode))
    .limit(1);
  const planId = plan.at(0)?.id;
  if (!planId) throw new Error("candidate_paid plan missing; run plans seed first");

  await db
    .insert(planPromotions)
    .values({
      planId,
      code: PLAN_PROMOTION_SEED.code,
      label: PLAN_PROMOTION_SEED.label,
      pricePaise: PLAN_PROMOTION_SEED.pricePaise,
      billingPeriod: PLAN_PROMOTION_SEED.billingPeriod,
      bannerText: PLAN_PROMOTION_SEED.bannerText,
      isActive: PLAN_PROMOTION_SEED.isActive,
      startsAt: new Date(),
    })
    .onConflictDoNothing({ target: planPromotions.code });

  log(`promotion: ${PLAN_PROMOTION_SEED.code} ensured`);
}

async function seedCategoriesAndSkills(): Promise<void> {
  await db
    .insert(categories)
    .values(
      CATEGORY_SEED.map((name, index) => ({
        name,
        slug: slugify(name),
        sortOrder: index * 10,
        isActive: true,
      })),
    )
    .onConflictDoNothing({ target: categories.slug });

  await db
    .insert(skills)
    .values(
      SKILL_SEED.map((s) => ({
        name: s.name,
        slug: slugify(s.name),
        category: s.category,
      })),
    )
    .onConflictDoNothing({ target: skills.slug });

  log(`categories: ${CATEGORY_SEED.length}, skills: ${SKILL_SEED.length}`);
}

async function seedAddons(): Promise<void> {
  await db
    .insert(addons)
    .values(
      ADDON_SEED.map((a) => ({
        code: a.code,
        name: a.name,
        description: a.description,
        type: a.type,
        durationDays: a.durationDays,
        sortOrder: a.sortOrder,
        isActive: false,
        pricePaise: null,
      })),
    )
    .onConflictDoNothing({ target: addons.code });
  log(`addons: ${ADDON_SEED.length} definitions ensured (inactive, no price)`);
}

async function seedSiteSettings(): Promise<void> {
  await db
    .insert(siteSettings)
    .values({
      id: 1,
      brandName: "Ravelyth Talent",
      tagline: "Connecting Great People with Great Opportunities",
      subTagline: "Right People | Better Opportunities | Stronger Tomorrow",
      country: "India",
      currency: "INR",
    })
    .onConflictDoNothing({ target: siteSettings.id });
  log("site_settings: singleton row ensured (legal details left blank for admin)");
}

async function main(): Promise<void> {
  await seedPlans();
  await seedPromotion();
  await seedCategoriesAndSkills();
  await seedAddons();
  await seedSiteSettings();
  log("reference seed complete.");
}

main()
  .catch((error) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
