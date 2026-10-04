"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, planFeatures, planPromotions, plans } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";

const MAX_SAFE_PAISA = Number.MAX_SAFE_INTEGER;

const planSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  audience: z.enum(["candidate", "employer"]),
  description: z.string().trim().max(1000).optional(),
  priceMonthlyPaise: z.coerce.number().int().min(0).max(MAX_SAFE_PAISA),
  priceYearlyPaise: z.coerce.number().int().min(0).max(MAX_SAFE_PAISA),
  jobPostsPerMonth: z.preprocess(
    (value) => value === "" || value === null ? null : Number(value),
    z.number().int().min(1).max(100000).nullable(),
  ),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  features: z.string().max(12000),
});

function parseFeatures(input: string) {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: Array<{
    featureKey: string;
    isEnabled: boolean;
    limitValue: number | null;
    label: string | null;
  }> = [];
  const keys = new Set<string>();

  for (const line of lines) {
    const [featureKey, enabled, limitText, ...labelParts] = line.split("|");
    const key = z.string().min(2).max(80).regex(/^[a-z0-9_-]+$/).safeParse(featureKey);
    const limit = limitText ? Number(limitText) : null;
    if (!key.success || (enabled !== "true" && enabled !== "false")) {
      throw new AppError("Entitlements must use key|true-or-false|limit|label format.", 422);
    }
    if (keys.has(key.data)) {
      throw new AppError(`Duplicate entitlement key: ${key.data}.`, 422);
    }
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000000)) {
      throw new AppError(`Invalid limit for entitlement ${key.data}.`, 422);
    }
    keys.add(key.data);
    rows.push({
      featureKey: key.data,
      isEnabled: enabled === "true",
      limitValue: limit,
      label: labelParts.join("|").trim() || null,
    });
  }
  return rows;
}

export async function savePlanAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = planSchema.safeParse({
    id: String(formData.get("id") ?? "").trim() || undefined,
    code: formData.get("code"),
    name: formData.get("name"),
    audience: formData.get("audience"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    priceMonthlyPaise: formData.get("priceMonthlyPaise"),
    priceYearlyPaise: formData.get("priceYearlyPaise"),
    jobPostsPerMonth: formData.get("jobPostsPerMonth"),
    sortOrder: formData.get("sortOrder"),
    isActive: formData.get("isActive") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    features: String(formData.get("features") ?? ""),
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid plan.", 422);
  }
  const value = parsed.data;
  if (value.id && !z.uuid().safeParse(value.id).success) {
    throw new AppError("Invalid plan identifier.", 422);
  }
  const featureRows = parseFeatures(value.features);
  const planData = {
    code: value.code,
    name: value.name,
    audience: value.audience,
    description: value.description || null,
    priceMonthlyPaise: value.priceMonthlyPaise,
    priceYearlyPaise: value.priceYearlyPaise,
    jobPostsPerMonth: value.jobPostsPerMonth,
    sortOrder: value.sortOrder,
    isActive: value.isActive,
    isFeatured: value.isFeatured,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    let planId = value.id;
    if (planId) {
      const changed = await tx.update(plans)
        .set(planData)
        .where(eq(plans.id, planId))
        .returning({ id: plans.id });
      if (!changed[0]) throw new AppError("Plan not found.", 404, "not_found");
      await tx.delete(planFeatures).where(eq(planFeatures.planId, planId));
    } else {
      const [created] = await tx.insert(plans).values(planData).returning({ id: plans.id });
      planId = created!.id;
    }
    if (featureRows.length > 0) {
      await tx.insert(planFeatures).values(
        featureRows.map((feature) => ({ ...feature, planId: planId! })),
      );
    }
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: value.id ? "plan.updated" : "plan.created",
      entityType: "plan",
      entityId: planId!,
      description: `${value.name} plan ${value.id ? "updated" : "created"}.`,
    });
  });

  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
}

const promotionSchema = z.object({
  id: z.string().optional(),
  planId: z.uuid(),
  code: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(2).max(120),
  pricePaise: z.coerce.number().int().positive().max(MAX_SAFE_PAISA),
  billingPeriod: z.enum(["monthly", "yearly"]),
  bannerText: z.string().trim().max(240).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isActive: z.boolean(),
});

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(date.getTime())) {
    throw new AppError("Promotion dates must be valid.", 422);
  }
  return date;
}

export async function savePromotionAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = promotionSchema.safeParse({
    id: String(formData.get("id") ?? "").trim() || undefined,
    planId: formData.get("planId"),
    code: formData.get("code"),
    label: formData.get("label"),
    pricePaise: formData.get("pricePaise"),
    billingPeriod: formData.get("billingPeriod"),
    bannerText: String(formData.get("bannerText") ?? "").trim() || undefined,
    startsAt: String(formData.get("startsAt") ?? "").trim() || undefined,
    endsAt: String(formData.get("endsAt") ?? "").trim() || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid promotion.", 422);
  }
  const value = parsed.data;
  if (value.id && !z.uuid().safeParse(value.id).success) {
    throw new AppError("Invalid promotion identifier.", 422);
  }
  const startsAt = parseOptionalDate(value.startsAt);
  const endsAt = parseOptionalDate(value.endsAt);
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new AppError("Promotion end must be after its start.", 422);
  }

  const promotionData = {
    planId: value.planId,
    code: value.code,
    label: value.label,
    pricePaise: value.pricePaise,
    billingPeriod: value.billingPeriod,
    bannerText: value.bannerText || null,
    startsAt,
    endsAt,
    isActive: value.isActive,
    updatedAt: new Date(),
  };
  const [plan] = await db.select({ id: plans.id })
    .from(plans).where(eq(plans.id, value.planId)).limit(1);
  if (!plan) throw new AppError("Promotion plan not found.", 404, "plan_not_found");

  const [saved] = value.id
    ? await db.update(planPromotions)
        .set(promotionData)
        .where(eq(planPromotions.id, value.id))
        .returning({ id: planPromotions.id })
    : await db.insert(planPromotions)
        .values(promotionData)
        .returning({ id: planPromotions.id });
  if (!saved) throw new AppError("Promotion not found.", 404, "not_found");

  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: value.id ? "promotion.updated" : "promotion.created",
    entityType: "promotion",
    entityId: saved.id,
    description: `${value.label} promotion ${value.id ? "updated" : "created"}.`,
  });
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
}
