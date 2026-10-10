import { eq, or } from "drizzle-orm";
import {
  chatBlocks,
  chatConversations,
  chatMessages,
  chatReports,
} from "@/lib/db/schema";

/**
 * Minimal shape of a Drizzle transaction/executor used for chat cleanup. Kept
 * structural (and accepting `unknown` input) so it can be unit tested with a
 * fake executor and so it matches the real `db.transaction` client.
 */
type ChatCleanupExecutor = {
  delete: (table: unknown) => {
    where: (condition: unknown) => Promise<unknown>;
  };
};

/**
 * Removes a user's chat footprint inside an existing transaction:
 * - messages they sent,
 * - conversations where they were the candidate,
 * - reports they filed,
 * - blocks in either direction.
 *
 * Company-owned conversations with other candidates are kept; only the leaving
 * member's messages are removed. Run this before deleting the user row.
 */
export async function deleteUserChatData(
  tx: unknown,
  userId: string,
): Promise<void> {
  const executor = tx as ChatCleanupExecutor;
  await executor
    .delete(chatMessages)
    .where(eq(chatMessages.senderUserId, userId));
  await executor
    .delete(chatConversations)
    .where(eq(chatConversations.candidateUserId, userId));
  await executor
    .delete(chatReports)
    .where(eq(chatReports.reporterUserId, userId));
  await executor.delete(chatBlocks).where(
    or(
      eq(chatBlocks.blockerUserId, userId),
      eq(chatBlocks.blockedUserId, userId),
    ),
  );
}
