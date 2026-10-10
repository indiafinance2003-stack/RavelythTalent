import { db } from "@/lib/db";
import { chatConversations, chatMessages } from "@/lib/db/schema";
import { and, count, eq, gte } from "drizzle-orm";

export async function countMessagesLastHour(userId: string): Promise<number> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db
    .select({ count: count() })
    .from(chatMessages)
    .where(and(eq(chatMessages.senderUserId, userId), gte(chatMessages.createdAt, hourAgo)));
  return rows[0]?.count ?? 0;
}

export async function countConversationsCreatedToday(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ count: count() })
    .from(chatConversations)
    .where(and(eq(chatConversations.candidateUserId, userId), gte(chatConversations.createdAt, today)));
  return rows[0]?.count ?? 0;
}