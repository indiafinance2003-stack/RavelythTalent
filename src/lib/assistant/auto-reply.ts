import "server-only";
import { createTransport } from "nodemailer";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantFaq,
  assistantSettings,
  auditLogs,
  inboxDrafts,
  inboxMessages,
  inboxThreads,
  suppressedEmails,
  type InboxAccountId,
} from "@/lib/db/schema";
import { z } from "zod";
import { getMailAccountCredentials } from "./mail-accounts";
import { autoReplyBlockReasons, planFaqReply } from "./faq-reply";
import { istDayStart } from "./digest-logic";

const emailSchema = z.email();

export type AutoReplyOutcome =
  | { kind: "not_applicable"; reason: string }
  | { kind: "needs_attention"; reason: string }
  | { kind: "draft"; reason: string }
  | { kind: "sent"; threadId: string; reason: string };

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 998);
}

export async function maybeAutoReply(input: {
  accountId: InboxAccountId;
  threadId: string;
  from: string;
  subject: string;
  text: string;
  category: string;
  isOptOut: boolean;
  isBounce: boolean;
}): Promise<AutoReplyOutcome> {
  if (input.isBounce || input.isOptOut || input.category === "out_of_office") {
    return { kind: "not_applicable", reason: "Bounce, opt-out and out-of-office messages use their own flow." };
  }
  if (!["general", "account"].includes(input.category)) {
    return { kind: "not_applicable", reason: `Category "${input.category}" always requires a human.` };
  }

  const [settings] = await db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)).limit(1);
  const faqs = await db.select().from(assistantFaq).where(eq(assistantFaq.isActive, true)).limit(500);

  const plan = planFaqReply({
    subject: input.subject,
    text: input.text,
    faqs,
    autoReplySafe: Boolean(settings?.autoSendSafeReplies),
  });
  if (plan.kind === "no_match") {
    return { kind: "needs_attention", reason: plan.reason };
  }

  const [suppression] = await db
    .select({ id: suppressedEmails.id })
    .from(suppressedEmails)
    .where(sql`lower(${suppressedEmails.email}) = ${input.from.toLocaleLowerCase("en")}`)
    .limit(1);
  const [priorReply] = await db
    .select({ id: inboxDrafts.id })
    .from(inboxDrafts)
    .where(and(eq(inboxDrafts.threadId, input.threadId), eq(inboxDrafts.source, "faq")))
    .limit(1);
  const today = istDayStart(new Date());
  const [todayRows] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(inboxDrafts)
    .where(and(
      eq(inboxDrafts.source, "faq"),
      eq(inboxDrafts.sendStatus, "sent"),
      gt(inboxDrafts.sentAt, today),
    ));

  const blockReasons = autoReplyBlockReasons({
    category: input.category,
    from: input.from,
    suppressed: Boolean(suppression),
    paused: Boolean(settings?.sendingPaused),
    alreadyRepliedInThread: Boolean(priorReply),
    todayCount: todayRows?.total ?? 0,
  });
  const maySend = plan.autoSend && blockReasons.length === 0;

  const signature = settings?.signatureText?.trim();
  const fullBody = signature ? `${plan.draftBody}\n\n${signature}` : plan.draftBody;

  const draftId = await insertFaqDraft(input, fullBody);
  if (!maySend) {
    const reason = blockReasons.length ? blockReasons.join("; ") : "FAQ draft saved for human approval.";
    await flagForReview(input.threadId, plan.draftBody, reason);
    return { kind: "draft", reason };
  }

  const sentBody = await deliverAutoReply({
    accountId: input.accountId,
    threadId: input.threadId,
    from: input.from,
    subject: input.subject,
    body: fullBody,
    draftId,
  });
  await db.transaction(async (tx) => {
    const [sent] = await tx.update(inboxDrafts).set({
      sendStatus: "sent",
      sentAt: sentBody.sentAt,
      updatedAt: sentBody.sentAt,
    }).where(and(eq(inboxDrafts.id, draftId), eq(inboxDrafts.sendStatus, "draft")))
      .returning({ id: inboxDrafts.id });
    if (!sent) throw new Error("FAQ draft state changed during SMTP delivery.");
    await tx.insert(inboxMessages).values({
      accountId: input.accountId,
      threadId: input.threadId,
      messageId: sentBody.messageId,
      inReplyTo: sentBody.lastInboundMessageId,
      fromAddress: sentBody.fromAddress,
      toAddresses: [input.from],
      subject: sentBody.subject,
      textBody: fullBody,
      attachmentNames: [],
      direction: "outbound",
      sentAt: sentBody.sentAt,
    });
    await tx.update(inboxThreads).set({
      status: "handled",
      needsAttention: false,
      lastMessageAt: sentBody.sentAt,
      updatedAt: sentBody.sentAt,
    }).where(eq(inboxThreads.id, input.threadId));
    await tx.insert(auditLogs).values({
      actorRole: "system",
      action: "assistant.auto_reply_sent",
      entityType: "inbox_draft",
      entityId: draftId,
      description: "A safe FAQ reply was sent automatically.",
      metadata: { threadId: input.threadId, accountId: input.accountId, faqId: plan.faqId || null },
    });
  });
  return { kind: "sent", threadId: input.threadId, reason: "Safe FAQ reply sent automatically." };
}

async function insertFaqDraft(
  input: { accountId: InboxAccountId; threadId: string },
  fullBody: string,
): Promise<string> {
  const [draft] = await db.insert(inboxDrafts).values({
    threadId: input.threadId,
    accountId: input.accountId,
    body: fullBody,
    source: "faq",
    sendStatus: "draft",
  }).returning({ id: inboxDrafts.id });
  return draft!.id;
}

async function flagForReview(threadId: string, reviewBody: string, reason: string): Promise<void> {
  await db.update(inboxThreads).set({
    needsAttention: true,
    updatedAt: new Date(),
  }).where(eq(inboxThreads.id, threadId));
  await db.insert(auditLogs).values({
    actorRole: "system",
    action: "assistant.auto_reply_draft_created",
    entityType: "inbox_thread",
    entityId: threadId,
    description: "A FAQ draft was created but left for human review.",
    metadata: { reason, preview: reviewBody.slice(0, 500) },
  });
}

async function deliverAutoReply(input: {
  accountId: InboxAccountId;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  draftId: string;
}): Promise<{
  sentAt: Date;
  messageId: string | null;
  lastInboundMessageId: string | null;
  fromAddress: string;
  subject: string;
}> {
  const credential = getMailAccountCredentials().find((candidate) => candidate.id === input.accountId);
  if (!credential) throw new Error(`Sender account ${input.accountId} is not configured for auto-replies.`);

  const recipient = emailSchema.safeParse(input.from);
  if (!recipient.success) throw new Error("Auto-reply sender address is invalid.");

  const [lastInbound] = await db.select().from(inboxMessages)
    .where(and(eq(inboxMessages.threadId, input.threadId), eq(inboxMessages.direction, "inbound")))
    .orderBy(desc(inboxMessages.sentAt), desc(inboxMessages.createdAt))
    .limit(1);
  const subject = /^re\s*:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`;

  const transporter = createTransport({
    host: credential.smtp.host,
    port: credential.smtp.port,
    secure: credential.smtp.secure,
    requireTLS: credential.smtp.requireTLS,
    auth: { user: credential.username, pass: credential.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  let messageId: string | null = null;
  try {
    const result = await transporter.sendMail({
      from: { name: credential.address, address: credential.address },
      to: recipient.data,
      subject: safeHeader(subject),
      text: input.body,
      headers: {
        "X-Ravelyth-Auto-Reply": "true",
        "X-Ravelyth-Assistant-Draft": input.draftId,
        ...(lastInbound?.messageId ? { "In-Reply-To": safeHeader(lastInbound.messageId) } : {}),
      },
    });
    messageId = result.messageId || null;
  } finally {
    transporter.close();
  }
  return {
    sentAt: new Date(),
    messageId,
    lastInboundMessageId: lastInbound?.messageId ?? null,
    fromAddress: credential.address.toLocaleLowerCase("en"),
    subject: safeHeader(subject),
  };
}