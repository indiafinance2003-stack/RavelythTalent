"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { db } from "@/lib/db";
import { auditLogs, socialSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { getSocialSettings } from "./settings";

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

async function actor() {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("socialSettings", admin.id), { limit: 20, windowSeconds: 60 });
  return admin;
}

async function saveSocialSettingsImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const parsed = z.object({
    enabled: z.boolean(),
    facebookEnabled: z.boolean(),
    instagramEnabled: z.boolean(),
    maxPostsPerDay: z.coerce.number().int().min(1).max(50),
    minMinutesBetweenPosts: z.coerce.number().int().min(1).max(1_440),
    windowStart: z.string().regex(HHMM),
    windowEnd: z.string().regex(HHMM),
    hashtags: z.string().trim().max(500),
    captionTemplate: z.string().trim().min(1).max(2_000),
    pauseAll: z.boolean(),
  }).safeParse({
    enabled: formData.get("enabled") === "on",
    facebookEnabled: formData.get("facebookEnabled") === "on",
    instagramEnabled: formData.get("instagramEnabled") === "on",
    maxPostsPerDay: formData.get("maxPostsPerDay"),
    minMinutesBetweenPosts: formData.get("minMinutesBetweenPosts"),
    windowStart: formData.get("windowStart"),
    windowEnd: formData.get("windowEnd"),
    hashtags: String(formData.get("hashtags") ?? ""),
    captionTemplate: String(formData.get("captionTemplate") ?? ""),
    pauseAll: formData.get("pauseAll") === "on",
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid social settings.", 422);
  }
  if (parsed.data.windowStart === parsed.data.windowEnd) {
    throw new AppError("The posting window start and end must differ.", 422);
  }

  await db
    .insert(socialSettings)
    .values({ id: 1, ...parsed.data, updatedByUserId: admin.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: socialSettings.id,
      set: { ...parsed.data, updatedByUserId: admin.id, updatedAt: new Date() },
    });
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "social.settings_updated",
    entityType: "social_settings",
    entityId: "1",
    description: "Social auto-posting settings updated.",
    metadata: {
      enabled: parsed.data.enabled,
      pauseAll: parsed.data.pauseAll,
      maxPostsPerDay: parsed.data.maxPostsPerDay,
    },
  });
  revalidatePath("/admin/social");
  revalidatePath("/admin/social/settings");
}

export async function saveSocialSettingsAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/social/settings", () => saveSocialSettingsImpl(formData));
}

/**
 * Kill switch from the /admin/social queue screen: pause or resume every
 * platform without opening the full settings form.
 */
async function setPauseImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const paused = formData.get("pauseAll") === "on";
  await getSocialSettings();
  await db
    .update(socialSettings)
    .set({ pauseAll: paused, updatedByUserId: admin.id, updatedAt: new Date() })
    .where(eq(socialSettings.id, 1));
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: paused ? "social.paused" : "social.resumed",
    entityType: "social_settings",
    entityId: "1",
    description: paused ? "Social auto-posting paused (kill switch)." : "Social auto-posting resumed.",
  });
  revalidatePath("/admin/social");
}

export async function setSocialPauseAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/social", () => setPauseImpl(formData));
}
