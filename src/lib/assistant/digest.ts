import "server-only";
import { and, count, desc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantSettings,
  auditLogs,
  campaignMessages,
  companyLeads,
  companyTargets,
  contactFormQueue,
  emailOutbox,
  inboxMessages,
  inboxThreads,
  leadEmailDrafts,
  users,
} from "@/lib/db/schema";
import { enqueueEmail } from "@/lib/email/queue";
import {
  digestDecision,
  buildDigestEmail,
  EMPTY_DIGEST_COUNTS,
  type DigestCounts,
} from "./digest-logic";

function countValue(rows: Array<{ value: number }> | undefined): number {
  return rows?.[0]?.value ?? 0;
}

export async function loadDigestCounts(now = new Date()): Promise<DigestCounts> {
  const dayStartInIst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => dayStartInIst.find((part) => part.type === type)?.value ?? "";
  const dayStart = new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00+05:30`);
  const prevDayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const draftApprovals = await db
    .select({ value: count() })
    .from(leadEmailDrafts)
    .where(eq(leadEmailDrafts.status, "pending_approval"));
  const [approvals, attention, replies, interested, targets, forms, sends, bounces] = await Promise.all([
    db.select({ value: count() }).from(campaignMessages).where(eq(campaignMessages.status, "pending_approval")),
    db.select({ value: count() }).from(inboxThreads).where(eq(inboxThreads.needsAttention, true)),
    db
      .select({ value: count() })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.direction, "inbound"), gt(inboxMessages.sentAt, last24h))),
    db
      .select({ value: count() })
      .from(companyLeads)
      .where(and(
        inArray(companyLeads.status, ["interested", "subscribed"]),
        gt(companyLeads.updatedAt, last24h),
      )),
    db
      .select({ value: count() })
      .from(companyTargets)
      .where(inArray(companyTargets.status, ["crawled", "emails_found", "contact_form_only"])),
    db.select({ value: count() }).from(contactFormQueue).where(eq(contactFormQueue.status, "pending")),
    db
      .select({ value: count() })
      .from(campaignMessages)
      .where(and(
        inArray(campaignMessages.status, ["sent", "replied", "bounced", "opted_out"]),
        gt(campaignMessages.sentAt, prevDayStart),
        lt(campaignMessages.sentAt, dayStart),
      )),
    db
      .select({ value: count() })
      .from(campaignMessages)
      .where(and(
        eq(campaignMessages.status, "bounced"),
        gt(campaignMessages.sentAt, prevDayStart),
        lt(campaignMessages.sentAt, dayStart),
      )),
  ]);

  return {
    approvalsWaiting: countValue(approvals) + countValue(draftApprovals),
    threadsNeedingAttention: countValue(attention),
    newReplies24h: countValue(replies),
    newInterestedLeads: countValue(interested),
    targetsToReview: countValue(targets),
    formsPending: countValue(forms),
    sendsYesterday: countValue(sends),
    bouncesYesterday: countValue(bounces),
  };
}

export type DigestResult =
  | { decision: "sent"; counts: DigestCounts; recipient: string }
  | { decision: "skip_disabled" | "skip_empty" | "skip_already_sent" | "skip_no_recipient"; counts: DigestCounts };

export async function sendDailyDigest(now = new Date()): Promise<DigestResult> {
  await db.insert(assistantSettings).values({ id: 1 }).onConflictDoNothing();
  const [settings] = await db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)).limit(1);
  if (!settings?.digestEnabled) return { decision: "skip_disabled", counts: EMPTY_DIGEST_COUNTS };

  const counts = await loadDigestCounts(now);
  const [last] = await db
    .select({ createdAt: emailOutbox.createdAt })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.templateKey, "assistant.daily_digest"), isNotNull(emailOutbox.createdAt)))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  const decision = digestDecision(counts, last?.createdAt ?? null, now);
  if (decision !== "send") return { decision, counts };

  let recipient: string | null = settings.digestEmail?.trim().toLocaleLowerCase("en") || null;
  if (!recipient) {
    const [admin] = await db
      .select({ email: users.email })
      .from(users)
      .where(and(
        eq(users.role, "admin"),
        eq(users.status, "active"),
        sql`deleted_at is null`,
        sql`email_verified_at is not null`,
      ))
      .orderBy(users.createdAt)
      .limit(1);
    recipient = admin?.email ?? null;
  }
  if (!recipient) return { decision: "skip_no_recipient", counts };

  const rendered = buildDigestEmail(counts, now);
  await enqueueEmail({
    to: recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    templateKey: "assistant.daily_digest",
    metadata: { counts: counts as unknown as Record<string, unknown> },
  });
  await db.insert(auditLogs).values({
    actorRole: "system",
    action: "assistant.daily_digest_queued",
    entityType: "email_outbox",
    description: "Daily assistant digest queued to the email outbox.",
    metadata: { counts: counts as unknown as Record<string, unknown>, recipient },
  });
  return { decision: "sent", counts, recipient };
}