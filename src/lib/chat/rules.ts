/**
 * Pure chat policy rules.
 *
 * Deliberately free of any database or framework import so every rule in
 * CLINE_PROMPT_2 Task E can be unit tested without a database.
 */

export type ChatSide = "candidate" | "employer";

export const CHAT_MESSAGE_MAX_LENGTH = 1000;
export const CHAT_MESSAGES_PER_HOUR = 20;
export const CHAT_CONVERSATIONS_PER_DAY = 5;
export const CHAT_FLAGGED_AUTO_MUTE_THRESHOLD = 3;
export const CHAT_AUTO_MUTE_HOURS = 24;
export const CHAT_AUTO_MUTE_MS = CHAT_AUTO_MUTE_HOURS * 60 * 60 * 1000;
export const CHAT_EMAIL_MIN_INTERVAL_MS = 60 * 60 * 1000;

export type ChatDecision =
  | { allowed: true }
  | { allowed: false; code: string; message: string };

const ALLOW: ChatDecision = { allowed: true };

function deny(code: string, message: string): ChatDecision {
  return { allowed: false, code, message };
}

/** Strips markup and normalizes whitespace. Plain text only, no HTML. */
export function sanitizePlainText(message: string): string {
  const withoutTags = message
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
  const normalized = withoutTags.replace(/\r\n/g, "\n").replace(/[\t\f\v]/g, " ");
  const collapsed = normalized.replace(/ +/g, " ").replace(/\n{3,}/g, "\n\n");
  return collapsed.trim();
}

/** Returns the sanitized body or throws a chat decision on empty/too long. */
export function checkMessageBody(body: string): ChatDecision {
  const sanitized = sanitizePlainText(body);
  if (sanitized.length === 0) {
    return deny("chat_empty_message", "Message cannot be empty.");
  }
  if (sanitized.length > CHAT_MESSAGE_MAX_LENGTH) {
    return deny(
      "chat_message_too_long",
      `Message must be ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    );
  }
  return ALLOW;
}

export type PreApplyInput = {
  globalEnabled: boolean;
  companyChatEnabled: boolean;
  companyChatBeforeApplyEnabled: boolean;
  hasApplication: boolean;
  hasExistingPreApplyConversation: boolean;
  blocked: boolean;
  mutedUntil: Date | null;
  now: Date;
  messagesLastHour: number;
  conversationsToday: number;
};

/** Rules for a candidate's single pre-application question. */
export function decidePreApplyQuestion(input: PreApplyInput): ChatDecision {
  if (!input.globalEnabled) {
    return deny("chat_disabled", "Chat is temporarily unavailable.");
  }
  if (!input.companyChatEnabled) {
    return deny("chat_disabled", "This employer has chat turned off.");
  }
  if (!input.companyChatBeforeApplyEnabled) {
    return deny(
      "chat_before_apply_disabled",
      "This employer does not accept questions before you apply.",
    );
  }
  if (input.hasApplication) {
    return deny(
      "already_applied",
      "You have already applied. Continue the conversation from your messages.",
    );
  }
  if (input.hasExistingPreApplyConversation) {
    return deny(
      "preapply_limit",
      "You can send only one question per job before applying.",
    );
  }
  if (input.blocked) {
    return deny("chat_blocked", "You cannot message this employer.");
  }
  if (input.mutedUntil && input.mutedUntil > input.now) {
    return deny("chat_muted", "Messaging is temporarily muted.");
  }
  if (input.conversationsToday >= CHAT_CONVERSATIONS_PER_DAY) {
    return deny(
      "chat_rate_limited",
      "Too many new conversations today. Try again later.",
    );
  }
  if (input.messagesLastHour >= CHAT_MESSAGES_PER_HOUR) {
    return deny("chat_rate_limited", "Too many messages. Slow down.");
  }
  return ALLOW;
}

export type EmployerStartInput = {
  globalEnabled: boolean;
  companyChatEnabled: boolean;
  isCompanyMember: boolean;
  hasApplication: boolean;
  blocked: boolean;
  mutedUntil: Date | null;
  now: Date;
  messagesLastHour: number;
};

/** Employers may only start a conversation once an application exists. */
export function decideEmployerStart(input: EmployerStartInput): ChatDecision {
  if (!input.globalEnabled) {
    return deny("chat_disabled", "Chat is temporarily unavailable.");
  }
  if (!input.companyChatEnabled) {
    return deny("chat_disabled", "Chat is turned off for this company.");
  }
  if (!input.isCompanyMember) {
    return deny("not_company_member", "Unauthorized.");
  }
  if (!input.hasApplication) {
    return deny(
      "employer_cannot_start",
      "You can message a candidate only after they apply.",
    );
  }
  if (input.blocked) {
    return deny("chat_blocked", "This candidate has blocked you.");
  }
  if (input.mutedUntil && input.mutedUntil > input.now) {
    return deny("chat_muted", "Messaging is temporarily muted.");
  }
  if (input.messagesLastHour >= CHAT_MESSAGES_PER_HOUR) {
    return deny("chat_rate_limited", "Too many messages. Slow down.");
  }
  return ALLOW;
}

export type SendMessageInput = {
  globalEnabled: boolean;
  companyChatEnabled: boolean;
  senderSide: ChatSide;
  senderIsParticipant: boolean;
  conversationPreApply: boolean;
  hasApplication: boolean;
  employerHasReplied: boolean;
  blocked: boolean;
  mutedUntil: Date | null;
  now: Date;
  messagesLastHour: number;
  bodyLength: number;
};

/** Rules for sending a message inside an existing conversation. */
export function decideSendMessage(input: SendMessageInput): ChatDecision {
  if (!input.globalEnabled) {
    return deny("chat_disabled", "Chat is temporarily unavailable.");
  }
  if (!input.companyChatEnabled) {
    return deny("chat_disabled", "Chat is turned off for this company.");
  }
  if (!input.senderIsParticipant) {
    return deny("not_participant", "Unauthorized.");
  }
  if (
    input.senderSide === "candidate" &&
    input.conversationPreApply &&
    !input.hasApplication &&
    !input.employerHasReplied
  ) {
    return deny(
      "chat_preapply_limit",
      "Wait for the employer to reply before sending another message.",
    );
  }
  if (input.blocked) {
    return deny("chat_blocked", "Messaging is blocked.");
  }
  if (input.mutedUntil && input.mutedUntil > input.now) {
    return deny("chat_muted", "Messaging is temporarily muted.");
  }
  if (input.messagesLastHour >= CHAT_MESSAGES_PER_HOUR) {
    return deny("chat_rate_limited", "Too many messages. Slow down.");
  }
  if (input.bodyLength === 0) {
    return deny("chat_empty_message", "Message cannot be empty.");
  }
  if (input.bodyLength > CHAT_MESSAGE_MAX_LENGTH) {
    return deny(
      "chat_message_too_long",
      `Message must be ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    );
  }
  return ALLOW;
}

export type ConversationAccessInput = {
  viewerUserId: string;
  viewerCompanyIds: string[];
  candidateUserId: string;
  companyId: string;
  party: ChatSide;
};

/** IDOR guard: a party can read a conversation only if it belongs to them. */
export function canViewConversation(input: ConversationAccessInput): boolean {
  if (input.party === "candidate") {
    return input.viewerUserId === input.candidateUserId;
  }
  return input.viewerCompanyIds.includes(input.companyId);
}

/** 3 flagged messages in 24 hours auto-mutes the sender. */
export function shouldAutoMute(flaggedCountLast24h: number): boolean {
  return flaggedCountLast24h >= CHAT_FLAGGED_AUTO_MUTE_THRESHOLD;
}

export function muteUntilFrom(now: Date): Date {
  return new Date(now.getTime() + CHAT_AUTO_MUTE_MS);
}

/** At most one chat email per conversation per hour (no message text inside). */
export function chatEmailDecision(
  lastSentAt: Date | null,
  now: Date,
): "send" | "skip" {
  if (!lastSentAt) return "send";
  return now.getTime() - lastSentAt.getTime() >= CHAT_EMAIL_MIN_INTERVAL_MS
    ? "send"
    : "skip";
}
