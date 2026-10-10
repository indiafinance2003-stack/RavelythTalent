"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { applications, chatConversations, chatMessages, companies } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { validateChatMessage, isBlocked, applyAutoMuteIfNeeded } from "@/lib/chat/service";
import { countMessagesLastHour } from "@/lib/chat/rate-limit";
import { chatMessageFlagsPayment } from "@/lib/chat/scam-scan";
import { listUserCompanies } from "@/lib/entitlements";

const schema = z.object({
  conversationId: z.uuid(),
  body: z.string().max(1000),
});

export async function sendMessage(formData: FormData) {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const parsed = schema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    throw new AppError("Invalid input.", 422);
  }
  const { conversationId, body } = parsed.data;
  const message = validateChatMessage(body);

  const conv = (
    await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1)
  ).at(0);
  if (!conv) {
    throw new AppError("Conversation not found.", 404);
  }

  const company = (
    await db
      .select({ chatEnabled: companies.chatEnabled })
      .from(companies)
      .where(eq(companies.id, conv.companyId))
      .limit(1)
  ).at(0);
  if (!company?.chatEnabled) {
    throw new AppError("Chat not available.", 403, "chat_disabled");
  }

  if (user.chatMuteUntil && user.chatMuteUntil > new Date()) {
    throw new AppError("Messaging is temporarily muted.", 403, "chat_muted");
  }

  let side: "candidate" | "employer";
  if (user.id === conv.candidateUserId) {
    side = "candidate";
    if (await isBlocked(user.id, conv.companyId)) {
      throw new AppError("Cannot send message.", 403, "chat_blocked");
    }
    if (conv.preApply) {
      const app = (
        await db
          .select({ id: applications.id })
          .from(applications)
          .where(and(eq(applications.jobId, conv.jobId), eq(applications.candidateUserId, user.id)))
          .limit(1)
      ).at(0);
      if (!app) {
        const hasReply = (
          await db
            .select({ id: chatMessages.id })
            .from(chatMessages)
            .where(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.senderSide, "employer")))
            .limit(1)
        ).at(0);
        if (!hasReply) {
          throw new AppError("Cannot reply until employer responds.", 403, "chat_preapply_limit");
        }
      }
    }
  } else {
    const companies = await listUserCompanies(user.id);
    const isMember = companies.some((c) => c.id === conv.companyId);
    if (!isMember) {
      throw new AppError("Unauthorized.", 403);
    }
    side = "employer";
    if (await isBlocked(user.id, conv.candidateUserId)) {
      throw new AppError("Cannot send message.", 403, "chat_blocked");
    }
  }

  if ((await countMessagesLastHour(user.id)) >= 20) {
    throw new AppError("Too many messages. Slow down.", 429, "chat_rate_limited");
  }

  const flagged = chatMessageFlagsPayment(message);
  const now = new Date();

  await db.insert(chatMessages).values({
    conversationId,
    senderUserId: user.id,
    senderSide: side,
    body: message,
    flagged,
  });

  await db
    .update(chatConversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(chatConversations.id, conversationId));

  if (flagged) {
    await applyAutoMuteIfNeeded(user.id);
  }

  revalidatePath(`/dashboard/messages`);
  revalidatePath(`/recruiter/messages`);
}
