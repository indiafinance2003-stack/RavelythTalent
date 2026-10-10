"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import { db } from "@/lib/db";
import {
  applications,
  chatConversations,
  chatMessages,
  companies,
} from "@/lib/db/schema";
import { listUserCompanies } from "@/lib/entitlements";
import { getCompanyOwnerId } from "@/lib/chat/queries";
import { assertGlobalChatEnabled } from "@/lib/chat/gate";
import { decideSendMessage, type ChatSide } from "@/lib/chat/rules";
import {
  applyAutoMuteIfNeeded,
  isBlocked,
  validateChatMessage,
} from "@/lib/chat/service";
import { countMessagesLastHour } from "@/lib/chat/rate-limit";
import { chatMessageFlagsPayment } from "@/lib/chat/scam-scan";
import { notifyChatCounterparty } from "@/lib/chat/notify";

const schema = z.object({
  conversationId: z.uuid(),
  body: z.string().max(1200),
});

export async function sendMessageAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    await assertGlobalChatEnabled();

    const parsed = schema.safeParse({
      conversationId: formData.get("conversationId"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Invalid input.");
    }
    const { conversationId, body } = parsed.data;

    const conv = (
      await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
        .limit(1)
    ).at(0);
    if (!conv) return formError("Conversation not found.");

    const company = (
      await db
        .select({ chatEnabled: companies.chatEnabled })
        .from(companies)
        .where(eq(companies.id, conv.companyId))
        .limit(1)
    ).at(0);

    let side: ChatSide;
    let senderIsParticipant: boolean;
    if (user.id === conv.candidateUserId) {
      side = "candidate";
      senderIsParticipant = true;
    } else {
      side = "employer";
      const memberships = await listUserCompanies(user.id);
      senderIsParticipant = memberships.some((c) => c.id === conv.companyId);
    }

    let hasApplication = !conv.preApply;
    if (conv.preApply && side === "candidate") {
      const app = (
        await db
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.jobId, conv.jobId),
              eq(applications.candidateUserId, user.id),
            ),
          )
          .limit(1)
      ).at(0);
      hasApplication = Boolean(app);
    }

    const employerReplied = (
      await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conversationId),
            eq(chatMessages.senderSide, "employer"),
          ),
        )
        .limit(1)
    ).at(0);

    const ownerId = await getCompanyOwnerId(conv.companyId);
    const counterpartUserId =
      side === "candidate" ? ownerId : conv.candidateUserId;
    const blocked = counterpartUserId
      ? (await isBlocked(user.id, counterpartUserId)) ||
        (await isBlocked(counterpartUserId, user.id))
      : false;

    const message = validateChatMessage(body);
    const decision = decideSendMessage({
      globalEnabled: true,
      companyChatEnabled: company?.chatEnabled ?? false,
      senderSide: side,
      senderIsParticipant,
      conversationPreApply: conv.preApply,
      hasApplication,
      employerHasReplied: Boolean(employerReplied),
      blocked,
      mutedUntil: user.chatMuteUntil,
      now: new Date(),
      messagesLastHour: await countMessagesLastHour(user.id),
      bodyLength: message.length,
    });
    if (!decision.allowed) {
      return formError(decision.message);
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

    await notifyChatCounterparty({
      conversationId,
      senderSide: side,
      senderUserId: user.id,
      candidateUserId: conv.candidateUserId,
      companyId: conv.companyId,
    });

    revalidatePath("/dashboard/messages");
    revalidatePath("/recruiter/messages");
    return formSuccess("Message sent.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[chat] send message failed:", error);
    return formError("We could not send your message. Please try again.");
  }
}
