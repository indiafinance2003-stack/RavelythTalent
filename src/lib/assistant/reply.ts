import "server-only";
import { createTransport } from "nodemailer";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLogs, inboxDrafts, inboxMessages, inboxThreads } from "@/lib/db/schema";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { getMailAccountCredentials } from "./mail-accounts";

const replyBodySchema = z.string().trim().min(1).max(20_000);
const emailSchema = z.email();

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 998);
}

export async function sendInboxDraft(draftId: string, actorUserId: string): Promise<void> {
  const [draft] = await db.update(inboxDrafts)
    .set({ sendStatus: "sending", updatedAt: new Date() })
    .where(and(
      eq(inboxDrafts.id, draftId),
      eq(inboxDrafts.sendStatus, "draft"),
      isNull(inboxDrafts.sentAt),
    ))
    .returning();
  if (!draft) {
    const [existing] = await db.select({ sendStatus: inboxDrafts.sendStatus })
      .from(inboxDrafts)
      .where(eq(inboxDrafts.id, draftId))
      .limit(1);
    if (!existing) throw new NotFoundError("Unsent inbox draft not found.");
    if (existing.sendStatus === "sending") {
      throw new ConflictError("A reply send is already in progress or needs delivery verification.");
    }
    throw new ConflictError("This draft has already been sent.");
  }

  await sendClaimedDraft(draft, actorUserId);
}

async function sendClaimedDraft(
  draft: typeof inboxDrafts.$inferSelect,
  actorUserId: string,
): Promise<void> {
  let deliveryAttempted = false;
  try {
    await sendReply(draft, actorUserId, () => {
      deliveryAttempted = true;
    });
  } catch (error) {
    if (!deliveryAttempted) {
      await db.update(inboxDrafts)
        .set({ sendStatus: "draft", updatedAt: new Date() })
        .where(and(eq(inboxDrafts.id, draft.id), eq(inboxDrafts.sendStatus, "sending")));
    }
    throw error;
  }
}

async function sendReply(
  draft: typeof inboxDrafts.$inferSelect,
  actorUserId: string,
  onDeliveryAttempt: () => void,
): Promise<void> {
  const [thread] = await db.select().from(inboxThreads)
    .where(eq(inboxThreads.id, draft.threadId))
    .limit(1);
  if (!thread) throw new NotFoundError("Inbox thread not found.");

  const credential = getMailAccountCredentials()
    .find((account) => account.id === draft.accountId);
  if (!credential) {
    throw new AppError(
      `The ${draft.accountId} inbox is not configured.`,
      503,
      "inbox_not_configured",
    );
  }

  const [lastInbound] = await db.select()
    .from(inboxMessages)
    .where(and(
      eq(inboxMessages.threadId, draft.threadId),
      eq(inboxMessages.direction, "inbound"),
    ))
    .orderBy(desc(inboxMessages.sentAt), desc(inboxMessages.createdAt))
    .limit(1);
  if (!lastInbound) throw new ConflictError("This thread has no inbound message to reply to.");

  const recipient = emailSchema.safeParse(lastInbound.fromAddress);
  if (!recipient.success) throw new AppError("The sender address is invalid.", 422, "invalid_reply_recipient");
  const parsedBody = replyBodySchema.safeParse(draft.body);
  if (!parsedBody.success) throw new AppError("The reply is empty or too long.", 422, "invalid_reply_body");

  const priorMessages = await db.select({ messageId: inboxMessages.messageId })
    .from(inboxMessages)
    .where(eq(inboxMessages.threadId, draft.threadId))
    .orderBy(inboxMessages.createdAt);
  const references = [...new Set(priorMessages
    .map((message) => message.messageId)
    .filter((messageId): messageId is string => Boolean(messageId)))].slice(-50);
  const subject = safeHeader(thread.subject);
  const replySubject = /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
  const headers: Record<string, string> = {
    "X-Ravelyth-Assistant-Draft": draft.id,
  };
  if (lastInbound.messageId) {
    headers["In-Reply-To"] = safeHeader(lastInbound.messageId);
    if (!references.includes(lastInbound.messageId)) references.push(lastInbound.messageId);
  }
  if (references.length) {
    headers.References = references.map(safeHeader).join(" ");
  }

  const transporter = createTransport({
    host: credential.smtp.host,
    port: credential.smtp.port,
    secure: credential.smtp.secure,
    requireTLS: credential.smtp.requireTLS,
    auth: {
      user: credential.username,
      pass: credential.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  let sentMessageId: string | null = null;
  try {
    onDeliveryAttempt();
    const result = await transporter.sendMail({
      from: { name: credential.address, address: credential.address },
      to: recipient.data,
      subject: replySubject,
      text: parsedBody.data,
      headers,
    });
    sentMessageId = result.messageId || null;
  } finally {
    transporter.close();
  }

  const sentAt = new Date();
  await db.transaction(async (tx) => {
    const [updatedDraft] = await tx.update(inboxDrafts)
      .set({ sendStatus: "sent", sentAt, updatedAt: sentAt })
      .where(and(
        eq(inboxDrafts.id, draft.id),
        eq(inboxDrafts.sendStatus, "sending"),
        isNull(inboxDrafts.sentAt),
      ))
      .returning({ id: inboxDrafts.id });
    if (!updatedDraft) throw new ConflictError("This draft has already been sent.");

    await tx.insert(inboxMessages).values({
      accountId: draft.accountId,
      threadId: thread.id,
      messageId: sentMessageId,
      inReplyTo: lastInbound.messageId,
      references: references.join(" "),
      fromAddress: credential.address.toLocaleLowerCase("en"),
      toAddresses: [recipient.data],
      subject: replySubject,
      textBody: parsedBody.data,
      attachmentNames: [],
      direction: "outbound",
      sentAt,
    });
    await tx.update(inboxThreads)
      .set({ lastMessageAt: sentAt, updatedAt: sentAt })
      .where(eq(inboxThreads.id, thread.id));
    await tx.insert(auditLogs).values({
      actorUserId,
      actorRole: "admin",
      action: "assistant.reply_sent",
      entityType: "inbox_draft",
      entityId: draft.id,
      description: "An inbox reply was sent after admin approval.",
      metadata: { threadId: thread.id, accountId: draft.accountId },
    });
  });
}
