import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailOutbox, notifications } from "@/lib/db/schema";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { chatNewMessageEmail } from "@/lib/email/templates/chat";
import { appUrl } from "@/lib/email/urls";
import type { ChatSide } from "./rules";
import { chatEmailDecision } from "./rules";
import { getCompanyOwnerContact, getUserContact } from "./queries";

export const CHAT_EMAIL_TEMPLATE_KEY = "chat.new_message";

export type ChatRecipient = {
  userId: string;
  name: string;
  email: string;
};

/**
 * Creates the in-app notification for a new chat message and, at most once per
 * conversation per hour, queues an outbox email that carries no message text.
 */
export async function notifyNewChatMessage(params: {
  conversationId: string;
  recipient: ChatRecipient;
  senderLabel: string;
  /** The recipient's side, used to build the correct deep link. */
  recipientSide: "candidate" | "employer";
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const link =
    params.recipientSide === "candidate"
      ? "/dashboard/messages"
      : "/recruiter/messages";

  try {
    await db.insert(notifications).values({
      userId: params.recipient.userId,
      type: "chat_message",
      title: "New message",
      body: `${params.senderLabel} sent you a message.`,
      link,
      metadata: { conversationId: params.conversationId },
    });
  } catch (error) {
    console.error("[chat] could not create in-app notification:", error);
  }

  await queueChatMessageEmail({
    conversationId: params.conversationId,
    recipient: params.recipient,
    senderLabel: params.senderLabel,
    link,
    now,
  });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Someone";
}

/**
 * Resolves the other party of a message and notifies them. The recipient is
 * the company owner for candidate messages and the candidate for employer
 * messages. The recipient label follows the spec: candidate first name, or the
 * replier's first name plus the company name for employers.
 */
export async function notifyChatCounterparty(params: {
  conversationId: string;
  senderSide: ChatSide;
  senderUserId: string;
  candidateUserId: string;
  companyId: string;
  now?: Date;
}): Promise<void> {
  if (params.senderSide === "candidate") {
    const recipient = await getCompanyOwnerContact(params.companyId);
    if (!recipient) return;
    const sender = await getUserContact(params.senderUserId);
    await notifyNewChatMessage({
      conversationId: params.conversationId,
      recipient: { userId: recipient.id, name: recipient.name, email: recipient.email },
      senderLabel: sender ? firstName(sender.name) : "A candidate",
      recipientSide: "employer",
      now: params.now,
    });
    return;
  }

  const recipient = await getUserContact(params.candidateUserId);
  if (!recipient) return;
  const owner = await getCompanyOwnerContact(params.companyId);
  const sender = await getUserContact(params.senderUserId);
  const senderLabel = `${sender ? firstName(sender.name) : "A recruiter"} · ${
    owner?.companyName ?? "the company"
  }`;
  await notifyNewChatMessage({
    conversationId: params.conversationId,
    recipient: { userId: recipient.id, name: recipient.name, email: recipient.email },
    senderLabel,
    recipientSide: "candidate",
    now: params.now,
  });
}

async function queueChatMessageEmail(params: {
  conversationId: string;
  recipient: ChatRecipient;
  senderLabel: string;
  link: string;
  now: Date;
}): Promise<void> {
  try {
    const [last] = await db
      .select({ createdAt: emailOutbox.createdAt })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.templateKey, CHAT_EMAIL_TEMPLATE_KEY),
          sql`${emailOutbox.metadata}->>'conversationId' = ${params.conversationId}`,
        ),
      )
      .orderBy(desc(emailOutbox.createdAt))
      .limit(1);

    if (chatEmailDecision(last?.createdAt ?? null, params.now) === "skip") {
      return;
    }

    const brand = await getEmailBrand();
    const conversationUrl = appUrl(
      `${params.link}?c=${params.conversationId}`,
    );
    await queueRenderedEmail({
      to: params.recipient.email,
      toName: params.recipient.name,
      templateKey: CHAT_EMAIL_TEMPLATE_KEY,
      rendered: chatNewMessageEmail({
        recipientName: params.recipient.name,
        senderLabel: params.senderLabel,
        conversationUrl,
        brand,
      }),
      metadata: { conversationId: params.conversationId },
    });
  } catch (error) {
    console.error("[chat] could not queue chat email:", error);
  }
}
