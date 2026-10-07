import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiUsage,
  assistantSettings,
  auditLogs,
  notifications,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { AnthropicAiProvider } from "./ai-provider";
import type { AiRequest, AiCompletion } from "./ai-provider";
import {
  actualAiCallCostMicros,
  aiBudgetAllows,
  estimateAiCallCostMicros,
  USD_MICROS_PER_DOLLAR,
} from "./ai-safety";

function monthStart(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not determine the current India calendar month.");
  return new Date(`${year}-${month}-01T00:00:00+05:30`);
}

async function notifyCapReached(spend: number, cap: number): Promise<void> {
  const [updated] = await db.update(assistantSettings).set({
    aiEnabled: false,
    updatedAt: new Date(),
  }).where(and(eq(assistantSettings.id, 1), eq(assistantSettings.aiEnabled, true)))
    .returning({ id: assistantSettings.id });
  if (!updated) return;

  await db.insert(auditLogs).values({
    actorRole: "system",
    action: "assistant.ai_cap_reached",
    entityType: "assistant_settings",
    entityId: "1",
    description: "Optional AI was disabled after its monthly spend cap was reached.",
    metadata: { spendUsd: spend / USD_MICROS_PER_DOLLAR, capUsd: cap },
  });
  const admins = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active"), isNull(users.deletedAt)));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      type: "assistant_attention",
      title: "Assistant AI spend cap reached",
      body: `AI was disabled for the rest of this month after reaching the $${cap.toFixed(2)} cap.`,
      link: "/admin/assistant/settings",
      metadata: { spendUsd: spend / USD_MICROS_PER_DOLLAR, capUsd: cap },
    });
  }
}

async function reserveUsage(purpose: string, model: string, estimateMicros: number): Promise<number> {
  const start = monthStart();
  const reservation = await db.transaction(async (tx) => {
    const [settings] = await tx.select().from(assistantSettings)
      .where(eq(assistantSettings.id, 1))
      .for("update")
      .limit(1);
    if (!settings || !settings.aiEnabled) {
      throw new AppError("AI not configured", 503, "ai_not_configured");
    }
    const [usage] = await tx.select({
      total: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsdMicros}), 0)::int`,
    }).from(aiUsage).where(gte(aiUsage.createdAt, start));
    const spend = usage?.total ?? 0;
    if (!aiBudgetAllows(spend, estimateMicros, settings.monthlySpendCapUsd)) {
      await tx.update(assistantSettings).set({ aiEnabled: false, updatedAt: new Date() })
        .where(eq(assistantSettings.id, 1));
      return { allowed: false as const, spend, cap: settings.monthlySpendCapUsd, id: null };
    }
    const [inserted] = await tx.insert(aiUsage).values({
      purpose,
      model,
      estimatedCostUsdMicros: estimateMicros,
    }).returning({ id: aiUsage.id });
    if (!inserted) throw new Error("AI usage reservation could not be stored.");
    const projectedSpend = spend + estimateMicros;
    if (projectedSpend >= settings.monthlySpendCapUsd * USD_MICROS_PER_DOLLAR) {
      await tx.update(assistantSettings).set({ aiEnabled: false, updatedAt: new Date() })
        .where(eq(assistantSettings.id, 1));
      return { allowed: true as const, spend: projectedSpend, cap: settings.monthlySpendCapUsd, id: inserted.id };
    }
    return { allowed: true as const, spend: projectedSpend, cap: settings.monthlySpendCapUsd, id: inserted.id };
  });

  if (reservation.spend >= reservation.cap * USD_MICROS_PER_DOLLAR) {
    await notifyCapReached(reservation.spend, reservation.cap);
  }
  if (!reservation.allowed || reservation.id === null) {
    await notifyCapReached(reservation.spend, reservation.cap);
    throw new AppError("AI monthly spend cap reached; AI is disabled for the rest of this month.", 429, "ai_spend_cap_reached");
  }
  return reservation.id;
}

export async function callAssistantAi(
  purpose: string,
  request: AiRequest,
): Promise<AiCompletion> {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) throw new AppError("AI not configured", 503, "ai_not_configured");
  const [settings] = await db.select().from(assistantSettings)
    .where(eq(assistantSettings.id, 1)).limit(1);
  if (!settings?.aiEnabled) throw new AppError("AI not configured", 503, "ai_not_configured");
  const model = settings.model || "claude-haiku-4-5";
  if (model !== "claude-haiku-4-5") {
    throw new AppError("The configured AI model is not supported.", 503, "ai_model_unsupported");
  }
  const reservedMicros = estimateAiCallCostMicros(
    request.system.length + request.user.length,
    request.maxTokens,
  );
  const usageId = await reserveUsage(purpose, model, reservedMicros);
  const provider = new AnthropicAiProvider(env.ANTHROPIC_API_KEY);
  const result = await provider.complete({ ...request, model });
  const actualMicros = actualAiCallCostMicros(result.inputTokens, result.outputTokens);
  await db.update(aiUsage).set({
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCostUsdMicros: actualMicros,
  }).where(eq(aiUsage.id, usageId));

  const [total] = await db.select({
    value: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsdMicros}), 0)::int`,
  }).from(aiUsage).where(gte(aiUsage.createdAt, monthStart()));
  if ((total?.value ?? 0) >= settings.monthlySpendCapUsd * USD_MICROS_PER_DOLLAR) {
    await notifyCapReached(total?.value ?? actualMicros, settings.monthlySpendCapUsd);
  }
  return result;
}
