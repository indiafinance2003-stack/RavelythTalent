"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  auditLogs,
  inboxDrafts,
  inboxThreads,
} from "@/lib/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { sendInboxDraft } from "./reply";

const assistantMutationLimit = { limit: 40, windowSeconds: 60 };
const uuidSchema = z.uuid();

async function actor() {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(
    rateKey("assistantMutation", admin.id),
    assistantMutationLimit,
  );
  return admin;
}

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

async function saveDraftImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const parsed = z.object({
    threadId: uuidSchema,
    draftId: uuidSchema.optional(),
    body: z.string().trim().min(1).max(20_000),
  }).safeParse({
    threadId: value(formData, "threadId"),
    draftId: value(formData, "draftId") || undefined,
    body: value(formData, "body"),
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid inbox draft.", 422);

  const [thread] = await db.select({
    id: inboxThreads.id,
    accountId: inboxThreads.accountId,
  }).from(inboxThreads)
    .where(eq(inboxThreads.id, parsed.data.threadId))
    .limit(1);
  if (!thread) throw new NotFoundError("Inbox thread not found.");

  const now = new Date();
  if (parsed.data.draftId) {
    const [updated] = await db.update(inboxDrafts)
      .set({ body: parsed.data.body, updatedAt: now })
      .where(and(
        eq(inboxDrafts.id, parsed.data.draftId),
        eq(inboxDrafts.threadId, thread.id),
        eq(inboxDrafts.sendStatus, "draft"),
        isNull(inboxDrafts.sentAt),
      ))
      .returning({ id: inboxDrafts.id });
    if (!updated) throw new NotFoundError("Unsent inbox draft not found.");
  } else {
    await db.insert(inboxDrafts).values({
      threadId: thread.id,
      accountId: thread.accountId,
      body: parsed.data.body,
      source: "manual",
      createdByUserId: admin.id,
    });
  }

  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.draft_saved",
    entityType: "inbox_thread",
    entityId: thread.id,
    description: "An inbox reply draft was saved.",
  });
  revalidatePath("/admin/assistant");
}

export async function saveInboxDraftAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant", () => saveDraftImpl(formData));
}

async function updateThreadImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const parsed = z.object({
    threadId: uuidSchema,
    status: z.enum(["open", "handled"]).optional(),
    needsAttention: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  }).safeParse({
    threadId: value(formData, "threadId"),
    status: value(formData, "status") || undefined,
    needsAttention: value(formData, "needsAttention") || undefined,
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid thread update.", 422);
  if (!parsed.data.status && parsed.data.needsAttention === undefined) {
    throw new AppError("Choose a thread update.", 422);
  }

  const values = {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.needsAttention !== undefined
      ? { needsAttention: parsed.data.needsAttention }
      : {}),
    ...(parsed.data.status === "handled" ? { needsAttention: false } : {}),
    updatedAt: new Date(),
  };
  const [updated] = await db.update(inboxThreads)
    .set(values)
    .where(eq(inboxThreads.id, parsed.data.threadId))
    .returning({ id: inboxThreads.id });
  if (!updated) throw new NotFoundError("Inbox thread not found.");

  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.thread_updated",
    entityType: "inbox_thread",
    entityId: updated.id,
    description: parsed.data.status === "handled"
      ? "Inbox thread marked handled."
      : parsed.data.needsAttention
        ? "Inbox thread flagged for attention."
        : "Inbox thread attention flag cleared.",
    metadata: {
      status: parsed.data.status,
      needsAttention: parsed.data.status === "handled"
        ? false
        : parsed.data.needsAttention,
    },
  });
  revalidatePath("/admin/assistant");
  revalidatePath("/admin");
}

export async function updateInboxThreadAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant", () => updateThreadImpl(formData));
}

async function sendReplyImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const parsed = uuidSchema.safeParse(value(formData, "draftId"));
  if (!parsed.success) throw new AppError("Choose a valid reply draft.", 422);

  await sendInboxDraft(parsed.data, admin.id);
  revalidatePath("/admin/assistant");
  revalidatePath("/admin");
}

export async function sendInboxReplyAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant", () => sendReplyImpl(formData));
}
