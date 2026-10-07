"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { db } from "@/lib/db";
import { assistantFaq, assistantSettings, auditLogs } from "@/lib/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { getEnv } from "@/lib/env";

async function actor() {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("assistantSettings", admin.id), { limit: 20, windowSeconds: 60 });
  return admin;
}

async function saveSettingsImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const parsed = z.object({
    aiEnabled: z.boolean(),
    monthlySpendCapUsd: z.coerce.number().int().min(0).max(100_000),
    signatureText: z.string().trim().max(2_000).nullable(),
    businessDescription: z.string().trim().max(5_000).nullable(),
    optOutText: z.string().trim().min(1).max(500),
    dailySendCap: z.coerce.number().int().min(1).max(40),
    sendWindowStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    sendWindowEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  }).safeParse({
    aiEnabled: formData.get("aiEnabled") === "on",
    monthlySpendCapUsd: formData.get("monthlySpendCapUsd"),
    signatureText: String(formData.get("signatureText") ?? "").trim() || null,
    businessDescription: String(formData.get("businessDescription") ?? "").trim() || null,
    optOutText: String(formData.get("optOutText") ?? ""),
    dailySendCap: formData.get("dailySendCap"),
    sendWindowStart: formData.get("sendWindowStart"),
    sendWindowEnd: formData.get("sendWindowEnd"),
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid assistant settings.", 422);
  if (parsed.data.sendWindowStart >= parsed.data.sendWindowEnd) {
    throw new AppError("The send window end must be later than its start.", 422);
  }
  if (parsed.data.aiEnabled && !getEnv().ANTHROPIC_API_KEY) {
    throw new AppError("Add ANTHROPIC_API_KEY before enabling AI.", 422, "ai_not_configured");
  }
  if (parsed.data.aiEnabled && parsed.data.monthlySpendCapUsd < 1) {
    throw new AppError("Set a positive monthly spend cap before enabling AI.", 422);
  }

  await db.insert(assistantSettings).values({
    id: 1,
    ...parsed.data,
    model: "claude-haiku-4-5",
    autoSendSafeReplies: false,
    updatedByUserId: admin.id,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: assistantSettings.id,
    set: {
      ...parsed.data,
      ...(parsed.data.monthlySpendCapUsd > 0 ? { aiEnabled: parsed.data.aiEnabled } : { aiEnabled: false }),
      model: "claude-haiku-4-5",
      autoSendSafeReplies: false,
      updatedByUserId: admin.id,
      updatedAt: new Date(),
    },
  });
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.settings_updated",
    entityType: "assistant_settings",
    entityId: "1",
    description: "Assistant and campaign sending settings updated.",
    metadata: {
      aiEnabled: parsed.data.aiEnabled,
      monthlySpendCapUsd: parsed.data.monthlySpendCapUsd,
      dailySendCap: parsed.data.dailySendCap,
    },
  });
  revalidatePath("/admin/assistant");
  revalidatePath("/admin/assistant/settings");
  revalidatePath("/admin/assistant/campaigns");
  revalidatePath("/admin");
}

export async function saveAssistantSettingsAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/settings", () => saveSettingsImpl(formData));
}

async function saveFaqImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const parsed = z.object({
    id: z.uuid().optional(),
    question: z.string().trim().min(1).max(1_000),
    answer: z.string().trim().min(1).max(5_000),
  }).safeParse({
    id: String(formData.get("id") ?? "") || undefined,
    question: formData.get("question"),
    answer: formData.get("answer"),
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid FAQ entry.", 422);

  if (parsed.data.id) {
    const [updated] = await db.update(assistantFaq).set({
      question: parsed.data.question,
      answer: parsed.data.answer,
      updatedByUserId: admin.id,
      updatedAt: new Date(),
    }).where(eq(assistantFaq.id, parsed.data.id))
      .returning({ id: assistantFaq.id });
    if (!updated) throw new NotFoundError("FAQ entry not found.");
  } else {
    await db.insert(assistantFaq).values({
      question: parsed.data.question,
      answer: parsed.data.answer,
      updatedByUserId: admin.id,
    });
  }
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.faq_saved",
    entityType: "assistant_faq",
    description: "Assistant FAQ entry saved.",
  });
  revalidatePath("/admin/assistant/settings");
}

export async function saveFaqAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/settings", () => saveFaqImpl(formData));
}

async function toggleFaqImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const parsed = z.object({ id: z.uuid(), isActive: z.enum(["true", "false"]) })
    .safeParse({
      id: formData.get("id"),
      isActive: formData.get("isActive"),
    });
  if (!parsed.success) throw new AppError("Invalid FAQ update.", 422);
  const [updated] = await db.update(assistantFaq).set({
    isActive: parsed.data.isActive === "true",
    updatedByUserId: admin.id,
    updatedAt: new Date(),
  }).where(eq(assistantFaq.id, parsed.data.id)).returning({ id: assistantFaq.id });
  if (!updated) throw new NotFoundError("FAQ entry not found.");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: parsed.data.isActive === "true" ? "assistant.faq_activated" : "assistant.faq_deactivated",
    entityType: "assistant_faq",
    entityId: updated.id,
    description: `Assistant FAQ entry ${parsed.data.isActive === "true" ? "activated" : "deactivated"}.`,
  });
  revalidatePath("/admin/assistant/settings");
}

export async function toggleFaqAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/settings", () => toggleFaqImpl(formData));
}
