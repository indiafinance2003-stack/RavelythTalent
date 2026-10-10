import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatBlocks, chatMessages } from "@/lib/db/schema";
import { users } from "@/lib/db/schema/auth";
import { AppError } from "@/lib/errors";
import {
  CHAT_AUTO_MUTE_HOURS,
  CHAT_CONVERSATIONS_PER_DAY,
  CHAT_FLAGGED_AUTO_MUTE_THRESHOLD,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGES_PER_HOUR,
  checkMessageBody,
  muteUntilFrom,
  sanitizePlainText,
  shouldAutoMute,
} from "./rules";

export {
  CHAT_AUTO_MUTE_HOURS,
  CHAT_CONVERSATIONS_PER_DAY,
  CHAT_FLAGGED_AUTO_MUTE_THRESHOLD,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGES_PER_HOUR,
  sanitizePlainText,
};

/** Validates and returns the sanitized body or throws a 400 AppError. */
export function validateChatMessage(body: string): string {
  const decision = checkMessageBody(body);
  if (!decision.allowed) {
    throw new AppError(decision.message, 400, decision.code);
  }
  return sanitizePlainText(body);
}

export async function isBlocked(
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  if (blockerId === blockedId) return false;
  const row = await db
    .select({ id: chatBlocks.id })
    .from(chatBlocks)
    .where(
      and(
        eq(chatBlocks.blockerUserId, blockerId),
        eq(chatBlocks.blockedUserId, blockedId),
      ),
    )
    .limit(1);
  return Boolean(row[0]);
}

export async function getUserFlaggedCountLast24h(
  userId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ count: count() })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.senderUserId, userId),
        eq(chatMessages.flagged, true),
        gte(chatMessages.createdAt, since),
      ),
    );
  return rows[0]?.count ?? 0;
}

export async function applyAutoMuteIfNeeded(userId: string): Promise<boolean> {
  const flagged = await getUserFlaggedCountLast24h(userId);
  if (shouldAutoMute(flagged)) {
    await db
      .update(users)
      .set({ chatMuteUntil: muteUntilFrom(new Date()) })
      .where(eq(users.id, userId));
    return true;
  }
  return false;
}
