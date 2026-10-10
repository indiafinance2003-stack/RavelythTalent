"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { chatReports } from "@/lib/db/schema";

const schema = z.object({
  conversationId: z.uuid().optional(),
  messageId: z.uuid().optional(),
  reason: z.enum(["spam", "scam", "abuse", "harassment", "other"]),
  details: z.string().max(500).optional(),
});

export async function reportMessage(formData: FormData) {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const parsed = schema.safeParse({
    conversationId: formData.get("conversationId") || undefined,
    messageId: formData.get("messageId") || undefined,
    reason: formData.get("reason"),
    details: formData.get("details") || undefined,
  });
  if (!parsed.success) {
    throw new AppError("Invalid input.", 422);
  }
  const { conversationId, messageId, reason, details } = parsed.data;
  if (!conversationId && !messageId) {
    throw new AppError("Invalid input.", 422);
  }

  await db.insert(chatReports).values({
    conversationId: conversationId ?? null,
    messageId: messageId ?? null,
    reporterUserId: user.id,
    reason,
    details: details ?? null,
    status: "open",
  });

  revalidatePath(`/dashboard/messages`);
  revalidatePath(`/recruiter/messages`);
  revalidatePath(`/admin/chat-reports`);
}
