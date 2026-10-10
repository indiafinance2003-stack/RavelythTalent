import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chatBlocks,
  chatConversations,
  chatMessages,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema/auth";
import { AppError } from "@/lib/errors";
import { chatMessageFlagsPayment } from "./scam-scan";

export const CHAT_MESSAGE_MAX_LENGTH = 1000;
export const CHAT_MESSAGES_PER_HOUR = 20;
export const CHAT_CONVERSATIONS_PER_DAY = 5;
export const CHAT_FLAGGED_AUTO_MUTE_THRESHOLD = 3;
export const CHAT_AUTO_MUTE_HOURS = 24;

function sanitizePlainText(message: string): string {
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

export function validateChatMessage(body: string): string {
  const sanitized = sanitizePlainText(body);
  if (sanitized.length === 0) {
    throw new AppError("Message cannot be empty.", 400, "chat_empty_message");
  }
  if (sanitized.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new AppError("Message is too long.", 400, "chat_message_too_long");
  }
  return sanitized;
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
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

export async function getUserFlaggedCountLast24h(userId: string): Promise<number> {
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
  if (flagged >= CHAT_FLAGGED_AUTO_MUTE_THRESHOLD) {
    const until = new Date(Date.now() + CHAT_AUTO_MUTE_HOURS * 60 * 60 * 1000);
    await db
      .update(users)
      .set({ chatMuteUntil: until })
      .where(eq(users.id, userId));
    return true;
  }
  return false;
}
