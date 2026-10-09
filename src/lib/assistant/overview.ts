import "server-only";
import { and, count, desc, eq, gt, inArray, isNotNull, lt, max } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantSettings,
  campaignMessages,
  companyLeads,
  companyTargets,
  contactFormQueue,
  inboxAccounts,
  inboxThreads,
  leadEmailDrafts,
} from "@/lib/db/schema";
import { istDayStart } from "./digest-logic";

export { istDayStart };

export type AssistantOverview = {
  sendingPaused: boolean;
  likedTerms: Array<{ label: string; value: string }>;
  approvalsWaiting: number;
  threadsAttention: number;
  targetsToReview: number;
  formsPending: number;
  lastInboxSync: Date | null;
  lastCampaignSend: Date | null;
  sentToday: number;
  dailyCap: number;
  bounceRatePercent: number | null;
};

function countValue(rows: Array<{ value: number }> | undefined): number {
  return rows?.[0]?.value ?? 0;
}

export async function loadAssistantOverview(now = new Date()): Promise<AssistantOverview> {
  const dayStart = istDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [
    [settings],
    leadTotalRows,
    interestedRows,
    doNotContactRows,
    approvalsRows,
    draftApprovalsRows,
    attentionRows,
    targetRows,
    formRows,
    lastInboxRows,
    lastSentRows,
    sentTodayRows,
    recentSends,
  ] = await Promise.all([
    db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)).limit(1),
    db.select({ value: count() }).from(companyLeads),
    db
      .select({ value: count() })
      .from(companyLeads)
      .where(inArray(companyLeads.status, ["interested", "subscribed"])),
    db.select({ value: count() }).from(companyLeads).where(eq(companyLeads.doNotContact, true)),
    db.select({ value: count() }).from(campaignMessages).where(eq(campaignMessages.status, "pending_approval")),
    db.select({ value: count() }).from(leadEmailDrafts).where(eq(leadEmailDrafts.status, "pending_approval")),
    db.select({ value: count() }).from(inboxThreads).where(eq(inboxThreads.needsAttention, true)),
    db
      .select({ value: count() })
      .from(companyTargets)
      .where(inArray(companyTargets.status, ["crawled", "emails_found", "contact_form_only"])),
    db.select({ value: count() }).from(contactFormQueue).where(eq(contactFormQueue.status, "pending")),
    db.select({ value: max(inboxAccounts.updatedAt) }).from(inboxAccounts),
    db
      .select({ value: max(campaignMessages.sentAt) })
      .from(campaignMessages)
      .where(isNotNull(campaignMessages.sentAt)),
    db
      .select({ value: count() })
      .from(campaignMessages)
      .where(
        and(
          inArray(campaignMessages.status, ["sent", "replied", "bounced", "opted_out"]),
          gt(campaignMessages.sentAt, dayStart),
          lt(campaignMessages.sentAt, dayEnd),
        ),
      ),
    db
      .select({ status: campaignMessages.status })
      .from(campaignMessages)
      .where(and(
        inArray(campaignMessages.status, ["sent", "replied", "bounced", "opted_out"]),
        isNotNull(campaignMessages.sentAt),
      ))
      .orderBy(desc(campaignMessages.sentAt))
      .limit(20),
  ]);

  const leadTotal = countValue(leadTotalRows);
  const leadInterested = countValue(interestedRows);
  const leadDoNotContact = countValue(doNotContactRows);
  const bounces = recentSends.filter((message) => message.status === "bounced").length;

  return {
    sendingPaused: settings?.sendingPaused ?? false,
    likedTerms: [
      { label: "Total leads", value: String(leadTotal) },
      { label: "Interested", value: String(leadInterested) },
      { label: "Opted out", value: String(leadDoNotContact) },
    ],
    approvalsWaiting: countValue(approvalsRows) + countValue(draftApprovalsRows),
    threadsAttention: countValue(attentionRows),
    targetsToReview: countValue(targetRows),
    formsPending: countValue(formRows),
    lastInboxSync: lastInboxRows?.[0]?.value ?? null,
    lastCampaignSend: lastSentRows?.[0]?.value ?? null,
    sentToday: countValue(sentTodayRows),
    dailyCap: settings?.dailySendCap ?? 15,
    bounceRatePercent: recentSends.length < 20 ? null : Math.round((bounces / recentSends.length) * 100),
  };
}