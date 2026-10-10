import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, chatMessages } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/current-user";
import { decideSendMessage, type ChatSide } from "./rules";
import {
  getCompanyChatFlags,
  getCompanyOwnerId,
  getConversationForViewer,
  listConversationMessages,
  markConversationRead,
} from "./queries";
import { countMessagesLastHour } from "./rate-limit";
import { isBlocked } from "./service";

export type ThreadMessageView = {
  id: string;
  senderSide: ChatSide;
  senderUserId: string;
  body: string;
  flagged: boolean;
  createdAt: string;
  readAt: string | null;
};

export type ConversationView = {
  detail: NonNullable<
    Awaited<ReturnType<typeof getConversationForViewer>>
  >;
  messages: ThreadMessageView[];
  canSend: boolean;
  sendDisabledReason?: string;
  counterpartName: string;
  counterpartUserId: string | null;
};

/**
 * Loads everything a chat page needs for one conversation, while enforcing the
 * same authorization and send rules the server actions use.
 */
export async function loadConversationView(params: {
  conversationId: string;
  viewer: CurrentUser;
  party: ChatSide;
}): Promise<ConversationView | null> {
  const { conversationId, viewer, party } = params;
  const detail = await getConversationForViewer(
    conversationId,
    viewer.id,
    party,
  );
  if (!detail) return null;

  const [company, ownerId] = await Promise.all([
    getCompanyChatFlags(detail.companyId),
    getCompanyOwnerId(detail.companyId),
  ]);

  const counterpartUserId =
    party === "candidate" ? ownerId : detail.candidateUserId;
  const counterpartName =
    party === "candidate" ? detail.companyName : detail.candidateName;

  const [rawMessages, blockedByMe, blockedMe] = await Promise.all([
    listConversationMessages(conversationId),
    counterpartUserId ? isBlocked(viewer.id, counterpartUserId) : Promise.resolve(false),
    counterpartUserId ? isBlocked(counterpartUserId, viewer.id) : Promise.resolve(false),
  ]);

  const [hasApplication, employerReplied] = await Promise.all([
    detail.preApply
      ? db
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.jobId, detail.jobId),
              eq(applications.candidateUserId, detail.candidateUserId),
            ),
          )
          .limit(1)
          .then((rows) => Boolean(rows[0]))
      : Promise.resolve(true),
    db
      .select({ value: count() })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.senderSide, "employer"),
        ),
      )
      .then((rows) => (rows[0]?.value ?? 0) > 0),
  ]);

  const decision = decideSendMessage({
    globalEnabled: true,
    companyChatEnabled: company?.chatEnabled ?? false,
    senderSide: party,
    senderIsParticipant: true,
    conversationPreApply: detail.preApply,
    hasApplication,
    employerHasReplied: employerReplied,
    blocked: blockedByMe || blockedMe,
    mutedUntil: viewer.chatMuteUntil,
    now: new Date(),
    messagesLastHour: await countMessagesLastHour(viewer.id),
    bodyLength: 1,
  });

  await markConversationRead(conversationId, party);

  return {
    detail,
    messages: rawMessages.map((message) => ({
      id: message.id,
      senderSide: message.senderSide,
      senderUserId: message.senderUserId,
      body: message.body,
      flagged: message.flagged,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt ? message.readAt.toISOString() : null,
    })),
    canSend: decision.allowed,
    sendDisabledReason: decision.allowed ? undefined : decision.message,
    counterpartName,
    counterpartUserId,
  };
}
