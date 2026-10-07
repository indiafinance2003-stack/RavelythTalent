import "server-only";
import { createTransport } from "nodemailer";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantSettings,
  auditLogs,
  campaignMessages,
  companyLeads,
  inboxAccounts,
  inboxMessages,
  inboxThreads,
  leadEvents,
  leadEmailDrafts,
  notifications,
  outreachCampaigns,
  siteSettings,
  suppressedEmails,
  users,
} from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { getMailAccountCredentials } from "./mail-accounts";
import { z } from "zod";
import {
  campaignDailyLimit,
  campaignLeadBlockReasons,
  hasCampaignSpacing,
  isWithinCampaignWindow,
  outreachBusinessAddress,
} from "./campaign-rules";
import { signUnsubscribeToken } from "./unsubscribe-token";

function istDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00+05:30`);
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 998);
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.replace(/[^A-Z0-9_-]/gi, "").slice(0, 40) || "unknown";
  }
  return "unknown";
}

async function pauseOnBounceRate(campaignId: string): Promise<boolean> {
  const last = await db.select({
    status: campaignMessages.status,
  }).from(campaignMessages)
    .where(and(
      eq(campaignMessages.campaignId, campaignId),
      inArray(campaignMessages.status, ["sent", "replied", "bounced", "opted_out"]),
    ))
    .orderBy(desc(campaignMessages.sentAt))
    .limit(20);
  const bounces = last.filter((message) => message.status === "bounced").length;
  if (last.length < 20 || bounces / last.length <= 0.1) return false;

  await db.update(outreachCampaigns).set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(outreachCampaigns.id, campaignId), eq(outreachCampaigns.status, "active")));
  await db.insert(auditLogs).values({
    actorRole: "system",
    action: "assistant.campaign_paused_bounce_rate",
    entityType: "outreach_campaign",
    entityId: campaignId,
    description: "Campaign automatically paused because more than 10% of its last 20 sends bounced.",
    metadata: { sends: last.length, bounces },
  });
  return true;
}

async function notifyAdmins(title: string, description: string, campaignId: string): Promise<void> {
  const admins = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active"), isNull(users.deletedAt)));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      type: "assistant_attention",
      title,
      body: description,
      link: `/admin/assistant/campaigns?campaign=${campaignId}`,
      metadata: { campaignId },
    });
  }
}

export async function processCampaigns(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  paused: number;
}> {
  await db.insert(assistantSettings).values({ id: 1 }).onConflictDoNothing();
  const [settings] = await db.select().from(assistantSettings)
    .where(eq(assistantSettings.id, 1)).limit(1);
  const now = new Date();
  if (!settings) throw new Error("Assistant sending settings are unavailable.");

  const dueMessages = await db.select({
    message: campaignMessages,
    campaign: outreachCampaigns,
    lead: companyLeads,
  }).from(campaignMessages)
    .innerJoin(outreachCampaigns, eq(outreachCampaigns.id, campaignMessages.campaignId))
    .innerJoin(companyLeads, eq(companyLeads.id, campaignMessages.leadId))
    .where(and(
      eq(campaignMessages.status, "approved"),
      eq(outreachCampaigns.status, "active"),
      lte(campaignMessages.scheduledAt, now),
    ))
    .orderBy(campaignMessages.scheduledAt, campaignMessages.createdAt)
    .limit(20);

  let sent = 0;
  let skipped = 0;
  let paused = 0;
  for (const item of dueMessages) {
    if (await pauseOnBounceRate(item.campaign.id)) {
      paused += 1;
      continue;
    }

    const cap = campaignDailyLimit(settings.dailySendCap);
    if (!cap || !isWithinCampaignWindow(now, settings.sendWindowStart, settings.sendWindowEnd)) break;

    const sentToday = await db.select({ total: sql<number>`count(*)::int` })
      .from(campaignMessages)
      .innerJoin(outreachCampaigns, eq(outreachCampaigns.id, campaignMessages.campaignId))
      .where(and(
        eq(outreachCampaigns.senderAccountId, item.campaign.senderAccountId),
        inArray(campaignMessages.status, ["sent", "replied", "bounced", "opted_out"]),
        gt(campaignMessages.sentAt, istDayStart(now)),
      ));
    if ((sentToday[0]?.total ?? 0) >= cap) break;

    const [lastSent] = await db.select({ sentAt: campaignMessages.sentAt })
      .from(campaignMessages)
      .innerJoin(outreachCampaigns, eq(outreachCampaigns.id, campaignMessages.campaignId))
      .where(and(
        eq(outreachCampaigns.senderAccountId, item.campaign.senderAccountId),
        inArray(campaignMessages.status, ["sent", "replied", "bounced", "opted_out"]),
        isNotNull(campaignMessages.sentAt),
      ))
      .orderBy(desc(campaignMessages.sentAt))
      .limit(1);
    const spacingMinutes = 2 + Math.floor(Math.random() * 5);
    if (!hasCampaignSpacing(now, lastSent?.sentAt ?? null, spacingMinutes)) break;

    const [suppression] = await db.select({ id: suppressedEmails.id })
      .from(suppressedEmails)
      .where(sql`lower(${suppressedEmails.email}) = ${item.lead.email.toLocaleLowerCase("en")}`)
      .limit(1);
    const [reply] = await db.select({ id: inboxMessages.id })
      .from(inboxThreads)
      .innerJoin(inboxMessages, eq(inboxMessages.threadId, inboxThreads.id))
      .where(and(eq(inboxThreads.leadId, item.lead.id), eq(inboxMessages.direction, "inbound")))
      .limit(1);
    const [recentSend] = await db.select({ id: campaignMessages.id })
      .from(campaignMessages)
      .where(and(
        eq(campaignMessages.leadId, item.lead.id),
        eq(campaignMessages.status, "sent"),
        gt(campaignMessages.sentAt, new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)),
      ))
      .limit(1);
    const blockReasons = campaignLeadBlockReasons({
      email: item.lead.email,
      emailValid: z.email().safeParse(item.lead.email).success,
      suppressed: Boolean(suppression),
      doNotContact: item.lead.doNotContact,
      status: item.lead.status,
      emailedWithin14Days: item.message.step === 1 && (
        Boolean(recentSend) ||
        Boolean(item.lead.lastContactedAt && item.lead.lastContactedAt.getTime() > now.getTime() - 14 * 24 * 60 * 60 * 1000)
      ),
      hasReplied: Boolean(reply) || item.lead.status === "replied",
    });
    if (blockReasons.length) {
      await db.update(campaignMessages).set({
        status: "skipped",
        lastError: blockReasons.join(" ").slice(0, 500),
        updatedAt: now,
      }).where(and(
        eq(campaignMessages.id, item.message.id),
        eq(campaignMessages.status, "approved"),
      ));
      if (item.message.leadEmailDraftId) {
        await db.update(leadEmailDrafts).set({
          status: "cancelled",
          updatedAt: now,
        }).where(eq(leadEmailDrafts.id, item.message.leadEmailDraftId));
      }
      skipped += 1;
      continue;
    }

    const account = getMailAccountCredentials()
      .find((candidate) => candidate.id === item.campaign.senderAccountId);
    if (!account) {
      await db.update(campaignMessages).set({
        status: "failed",
        lastError: `Sender account ${item.campaign.senderAccountId} is not configured.`,
        updatedAt: now,
      }).where(and(eq(campaignMessages.id, item.message.id), eq(campaignMessages.status, "approved")));
      skipped += 1;
      continue;
    }

    const [legal] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
    const legalName = legal?.legalCompanyName?.trim() ?? "";
    const legalAddress = legal ? outreachBusinessAddress(legal) : "";
    if (!legalName || !legalAddress) {
      await db.update(campaignMessages).set({
        status: "failed",
        lastError: "Legal sender identity or business address is no longer configured.",
        updatedAt: now,
      }).where(and(eq(campaignMessages.id, item.message.id), eq(campaignMessages.status, "approved")));
      skipped += 1;
      continue;
    }

    const [claimed] = await db.update(campaignMessages).set({
      status: "sending",
      attempts: sql`${campaignMessages.attempts} + 1`,
      updatedAt: now,
    }).where(and(
      eq(campaignMessages.id, item.message.id),
      eq(campaignMessages.status, "approved"),
    )).returning({ id: campaignMessages.id });
    if (!claimed) continue;

    const token = signUnsubscribeToken(item.lead.email, getEnv().SESSION_SECRET);
    const unsubscribeUrl = `${getEnv().APP_URL.replace(/\/+$/, "")}/api/unsubscribe/${token}`;
    const body = item.message.body.replace(
      /https?:\/\/[^\s]+\/api\/unsubscribe\/[A-Za-z0-9_.-]+/g,
      unsubscribeUrl,
    );
    const textBody = `${body}\n\n${legalName}\n${legalAddress}`;
    const transporter = createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      requireTLS: account.smtp.requireTLS,
      auth: { user: account.username, pass: account.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });

    let messageId: string | null = null;
    try {
      const result = await transporter.sendMail({
        from: { name: legalName, address: account.address },
        to: item.lead.email,
        subject: safeHeader(item.message.subject),
        text: textBody,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      messageId = result.messageId || null;
    } catch (error) {
      await db.update(campaignMessages).set({
        status: "failed",
        lastError: `SMTP delivery failed (${safeErrorCode(error)}).`,
        updatedAt: new Date(),
      }).where(and(eq(campaignMessages.id, item.message.id), eq(campaignMessages.status, "sending")));
      await notifyAdmins("Campaign delivery failed", "An approved campaign message could not be sent. Review its status before retrying.", item.campaign.id);
      skipped += 1;
      continue;
    } finally {
      transporter.close();
    }

    const sentAt = new Date();
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(campaignMessages).set({
        status: "sent",
        sentAt,
        messageId,
        lastError: null,
        updatedAt: sentAt,
      }).where(and(
        eq(campaignMessages.id, item.message.id),
        eq(campaignMessages.status, "sending"),
      )).returning({ id: campaignMessages.id });
      if (!updated) throw new Error("Campaign send state changed after SMTP delivery.");
      if (item.message.leadEmailDraftId) {
        await tx.update(leadEmailDrafts).set({
          status: "sent",
          updatedAt: sentAt,
        }).where(eq(leadEmailDrafts.id, item.message.leadEmailDraftId));
      }

      await tx.insert(inboxAccounts).values({ id: item.campaign.senderAccountId }).onConflictDoNothing();
      const [thread] = await tx.insert(inboxThreads).values({
        accountId: item.campaign.senderAccountId,
        subject: item.message.subject,
        participants: [account.address.toLocaleLowerCase("en"), item.lead.email.toLocaleLowerCase("en")],
        leadId: item.lead.id,
        lastMessageAt: sentAt,
      }).returning({ id: inboxThreads.id });
      if (thread) {
        await tx.insert(inboxMessages).values({
          accountId: item.campaign.senderAccountId,
          threadId: thread.id,
          messageId,
          fromAddress: account.address.toLocaleLowerCase("en"),
          toAddresses: [item.lead.email],
          subject: item.message.subject,
          textBody: textBody.slice(0, 128_000),
          attachmentNames: [],
          direction: "outbound",
          sentAt,
        });
      }
      const nextStatus = item.lead.status === "new" ? "emailed" : item.lead.status;
      await tx.update(companyLeads).set({
        status: nextStatus,
        lastContactedAt: sentAt,
        updatedAt: sentAt,
      }).where(eq(companyLeads.id, item.lead.id));
      await tx.insert(leadEvents).values({
        leadId: item.lead.id,
        eventType: "campaign_email_sent",
        fromStatus: item.lead.status,
        toStatus: nextStatus,
        details: `Campaign message ${item.message.step} sent.`,
        createdAt: sentAt,
      });

      const sequence = item.campaign.followupSequence ?? [];
      const nextSequence = sequence[item.message.step - 1];
      if (nextSequence?.enabled) {
        const firstStep = item.message.step === 1
          ? sentAt
          : (await tx.select({ sentAt: campaignMessages.sentAt })
            .from(campaignMessages)
            .where(and(
              eq(campaignMessages.campaignId, item.campaign.id),
              eq(campaignMessages.leadId, item.lead.id),
              eq(campaignMessages.step, 1),
            ))
            .limit(1))[0]?.sentAt ?? sentAt;
        const nextStep = item.message.step + 1;
        const followupToken = signUnsubscribeToken(item.lead.email, getEnv().SESSION_SECRET);
        const values = {
          company: item.lead.company,
          contact_name: item.lead.contactName ?? "",
          designation: item.lead.designation ?? "",
          city: item.lead.city ?? "",
          unsubscribe_url: `${getEnv().APP_URL.replace(/\/+$/, "")}/api/unsubscribe/${followupToken}`,
        };
        await tx.insert(campaignMessages).values({
          campaignId: item.campaign.id,
          leadId: item.lead.id,
          step: nextStep,
          subject: nextSequence.subject.replace(
            /\{\{\s*(company|contact_name|designation|city|unsubscribe_url)\s*\}\}/gi,
            (_match, key: string) => values[key.toLocaleLowerCase("en") as keyof typeof values] ?? "",
          ),
          body: nextSequence.body.replace(
            /\{\{\s*(company|contact_name|designation|city|unsubscribe_url)\s*\}\}/gi,
            (_match, key: string) => values[key.toLocaleLowerCase("en") as keyof typeof values] ?? "",
          ),
          status: "pending_approval",
          scheduledAt: new Date(firstStep.getTime() + nextSequence.delayDays * 24 * 60 * 60 * 1000),
        }).onConflictDoNothing();
      }
      await tx.insert(auditLogs).values({
        actorRole: "system",
        action: "assistant.campaign_message_sent",
        entityType: "campaign_message",
        entityId: item.message.id,
        description: "An administrator-approved campaign message was sent.",
        metadata: { campaignId: item.campaign.id, leadId: item.lead.id, step: item.message.step },
      });
    });
    sent += 1;
  }

  await db.insert(auditLogs).values({
    actorRole: "system",
    action: "assistant.campaign_processor_run",
    entityType: "outreach_campaign",
    description: "Campaign processor run completed.",
    metadata: { checked: dueMessages.length, sent, skipped, paused },
  });
  return { checked: dueMessages.length, sent, skipped, paused };
}
