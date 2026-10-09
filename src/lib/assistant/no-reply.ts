import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantSettings,
  auditLogs,
  campaignMessages,
  companyLeads,
  inboxMessages,
  inboxThreads,
  leadEvents,
} from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LEADS_PER_RUN = 1_000;

export const NO_REPLY_PENDING_STATUSES = [
  "pending_approval",
  "approved",
  "queued",
  "sending",
] as const;

export type NoReplyLeadState = {
  leadId: string;
  status: string;
  lastSentAt: Date | null;
  hasPendingMessages: boolean;
  hasInboundMessage: boolean;
  doNotContact: boolean;
};

/**
 * Pure decision: an `emailed` lead becomes `no_reply` when its whole sequence
 * is finished (no pending/approved/queued/sending messages), the most recent
 * `sent` campaign message is at least `afterDays` old, and no inbound message,
 * bounce, or opt-out was ever recorded for it.
 */
export function shouldMarkNoReply(
  candidate: NoReplyLeadState,
  now: Date,
  afterDays: number,
): boolean {
  if (candidate.status !== "emailed") return false;
  if (candidate.doNotContact) return false;
  if (candidate.hasPendingMessages) return false;
  if (candidate.hasInboundMessage) return false;
  if (!candidate.lastSentAt) return false;
  const minAgeMs = Math.max(0, Math.floor(afterDays)) * DAY_MS;
  return now.getTime() - candidate.lastSentAt.getTime() >= minAgeMs;
}

export async function markNoReplyLeads(now = new Date()): Promise<{
  checked: number;
  marked: number;
}> {
  await db.insert(assistantSettings).values({ id: 1 }).onConflictDoNothing();
  const [settings] = await db.select().from(assistantSettings)
    .where(eq(assistantSettings.id, 1)).limit(1);
  const afterDays = settings?.noReplyAfterDays ?? 3;

  const leads = await db.select({
    id: companyLeads.id,
    status: companyLeads.status,
    doNotContact: companyLeads.doNotContact,
  }).from(companyLeads)
    .where(eq(companyLeads.status, "emailed"))
    .limit(MAX_LEADS_PER_RUN);
  if (!leads.length) return { checked: 0, marked: 0 };
  const leadIds = leads.map((lead) => lead.id);

  const pendingRows = await db.selectDistinct({ leadId: campaignMessages.leadId })
    .from(campaignMessages)
    .where(and(
      inArray(campaignMessages.leadId, leadIds),
      inArray(campaignMessages.status, [...NO_REPLY_PENDING_STATUSES]),
    ));
  const pendingLeads = new Set(pendingRows.map((row) => row.leadId));

  const lastSentRows = await db.select({
    leadId: campaignMessages.leadId,
    lastSentAt: sql<Date | null>`max(${campaignMessages.sentAt})`,
  }).from(campaignMessages)
    .where(and(
      inArray(campaignMessages.leadId, leadIds),
      eq(campaignMessages.status, "sent"),
      isNotNull(campaignMessages.sentAt),
    ))
    .groupBy(campaignMessages.leadId);
  const lastSentByLead = new Map(
    lastSentRows.map((row) => [row.leadId, row.lastSentAt ? new Date(row.lastSentAt) : null]),
  );

  const inboundRows = await db.selectDistinct({ leadId: inboxThreads.leadId })
    .from(inboxThreads)
    .innerJoin(inboxMessages, eq(inboxMessages.threadId, inboxThreads.id))
    .where(and(
      inArray(inboxThreads.leadId, leadIds),
      eq(inboxMessages.direction, "inbound"),
    ));
  const inboundLeads = new Set(inboundRows.map((row) => row.leadId));

  const markedIds: string[] = [];
  for (const lead of leads) {
    const state: NoReplyLeadState = {
      leadId: lead.id,
      status: lead.status,
      lastSentAt: lastSentByLead.get(lead.id) ?? null,
      hasPendingMessages: pendingLeads.has(lead.id),
      hasInboundMessage: inboundLeads.has(lead.id),
      doNotContact: lead.doNotContact,
    };
    if (shouldMarkNoReply(state, now, afterDays)) markedIds.push(lead.id);
  }
  if (!markedIds.length) return { checked: leads.length, marked: 0 };

  await db.transaction(async (tx) => {
    for (const leadId of markedIds) {
      await tx.update(companyLeads)
        .set({ status: "no_reply", updatedAt: now })
        .where(and(eq(companyLeads.id, leadId), eq(companyLeads.status, "emailed")));
      await tx.insert(leadEvents).values({
        leadId,
        eventType: "no_reply_marked",
        fromStatus: "emailed",
        toStatus: "no_reply",
        details: `No reply within ${afterDays} day(s) after the last sent campaign email.`,
        createdAt: now,
      });
    }
    await tx.insert(auditLogs).values({
      actorRole: "system",
      action: "assistant.no_reply_marked",
      entityType: "company_lead",
      description: `${markedIds.length} lead(s) marked as no reply after ${afterDays} day(s) without a response.`,
      metadata: { marked: markedIds.length, checked: leads.length, afterDays },
    });
  });
  return { checked: leads.length, marked: markedIds.length };
}