import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  campaignMessages,
  inboxMessages,
  inboxThreads,
  suppressedEmails,
} from "@/lib/db/schema";
import { evaluateCampaignLead, type CampaignStepPlan } from "./campaign-rules";

export type CampaignLike = {
  id: string;
  followupSequence: Array<{ delayDays: number; subject: string; body: string; enabled: boolean }>;
  followsUpPrevious: boolean;
  minDaysSinceLastContact: number;
};

export type LeadLike = {
  id: string;
  company: string;
  contactName: string | null;
  designation?: string | null;
  city?: string | null;
  email: string;
  status: string;
  doNotContact: boolean;
  lastContactedAt: Date | null;
};

export type EvaluatedLead = LeadLike & {
  plan: CampaignStepPlan;
  eligible: boolean;
  reasons: string[];
  eligibleFrom: Date | null;
};

function latestDate(current: Date | null, candidate: Date | null): Date | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.getTime() > current.getTime() ? candidate : current;
}

/**
 * Computes, in batch, whether each provided lead may receive this campaign.
 *
 * The exact same evaluation drives the admin UI (reason shown per lead) and the
 * activation action (what actually gets queued), so the two can never diverge.
 * Three batched queries avoid an N+1 scan even with 1,000 leads.
 */
export async function evaluateLeadsForCampaign(
  campaign: CampaignLike,
  leads: LeadLike[],
  now: Date = new Date(),
): Promise<EvaluatedLead[]> {
  if (!leads.length) return [];
  const ids = leads.map((lead) => lead.id);
  const emails = [...new Set(leads.map((lead) => lead.email.toLocaleLowerCase("en")))];

  const [suppressedRows, replyRows, sentRows] = await Promise.all([
    emails.length
      ? db.select({ email: suppressedEmails.email }).from(suppressedEmails)
        .where(inArray(sql`lower(${suppressedEmails.email})`, emails))
      : Promise.resolve([] as Array<{ email: string }>),
    db.select({ leadId: inboxThreads.leadId })
      .from(inboxThreads)
      .innerJoin(inboxMessages, eq(inboxMessages.threadId, inboxThreads.id))
      .where(and(
        inArray(inboxThreads.leadId, ids),
        eq(inboxMessages.direction, "inbound"),
      )),
    db.select({ leadId: campaignMessages.leadId, sentAt: campaignMessages.sentAt })
      .from(campaignMessages)
      .where(and(
        inArray(campaignMessages.leadId, ids),
        eq(campaignMessages.status, "sent"),
      )),
  ]);

  const suppressed = new Set(suppressedRows.map((row) => row.email.toLocaleLowerCase("en")));
  const replied = new Set(replyRows.map((row) => row.leadId).filter((id): id is string => Boolean(id)));
  const lastSentByLead = new Map<string, Date>();
  for (const row of sentRows) {
    if (!row.sentAt) continue;
    lastSentByLead.set(row.leadId, latestDate(lastSentByLead.get(row.leadId) ?? null, row.sentAt) as Date);
  }

  return leads.map((lead) => {
    const lastSent = lastSentByLead.get(lead.id) ?? null;
    const lastEmailedAt = latestDate(lead.lastContactedAt, lastSent);
    const emailedWithin14Days = Boolean(
      lastEmailedAt && lastEmailedAt.getTime() > now.getTime() - 14 * 24 * 60 * 60 * 1000,
    );
    const evaluation = evaluateCampaignLead({
      now,
      email: lead.email,
      emailValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email),
      suppressed: suppressed.has(lead.email.toLocaleLowerCase("en")),
      doNotContact: lead.doNotContact,
      status: lead.status,
      lastContactedAt: lead.lastContactedAt,
      hasReplied: replied.has(lead.id) || lead.status === "replied",
      emailedWithin14Days,
      hasSentCampaignMessage: Boolean(lastSent),
      followupSequence: campaign.followupSequence,
      followsUpPrevious: campaign.followsUpPrevious,
      minDaysSinceLastContact: campaign.minDaysSinceLastContact,
      lastEmailedAt,
    });
    return {
      ...lead,
      plan: evaluation.plan,
      eligible: evaluation.eligible && evaluation.plan.action !== "skipped",
      reasons: evaluation.plan.action === "blocked"
        ? evaluation.reasons
        : evaluation.plan.action === "skipped"
          ? [evaluation.plan.reason]
          : [],
      eligibleFrom: evaluation.eligibleFrom,
    };
  });
}

export type { LeadLike as CampaignEligibilityLead };
