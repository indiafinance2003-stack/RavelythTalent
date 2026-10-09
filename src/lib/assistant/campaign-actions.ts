"use server";

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTransport } from "nodemailer";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { db } from "@/lib/db";
import {
  auditLogs,
  campaignMessages,
  companyLeads,
  inboxMessages,
  inboxThreads,
  inboxAccounts,
  outreachCampaigns,
  siteSettings,
  suppressedEmails,
  users,
} from "@/lib/db/schema";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { getEnv } from "@/lib/env";
import { getMailAccountCredentials } from "./mail-accounts";
import {
  campaignActivationBlockReasons,
  outreachBusinessAddress,
  planCampaignStep,
  renderCampaignTemplate,
} from "./campaign-rules";
import { signUnsubscribeToken } from "./unsubscribe-token";

const campaignMutationLimit = { limit: 20, windowSeconds: 60 };

async function adminActor() {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("assistantCampaignMutation", admin.id), campaignMutationLimit);
  return admin;
}

function formString(form: FormData, name: string): string {
  return String(form.get(name) ?? "");
}

const campaignSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(200),
  senderAccountId: z.enum(["support", "gmail"]),
  subjectTemplate: z.string().trim().min(1).max(998),
  bodyTemplate: z.string().trim().min(1).max(20_000),
  step2Enabled: z.boolean(),
  step2DelayDays: z.coerce.number().int().min(1).max(60),
  step2Subject: z.string().trim().max(998),
  step2Body: z.string().trim().max(20_000),
  step3Enabled: z.boolean(),
  step3DelayDays: z.coerce.number().int().min(1).max(60),
  step3Subject: z.string().trim().max(998),
  step3Body: z.string().trim().max(20_000),
  autoApproveFollowups: z.boolean(),
});

async function saveCampaignImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = campaignSchema.safeParse({
    id: formString(formData, "id") || undefined,
    name: formString(formData, "name"),
    senderAccountId: formString(formData, "senderAccountId"),
    subjectTemplate: formString(formData, "subjectTemplate"),
    bodyTemplate: formString(formData, "bodyTemplate"),
    step2Enabled: formString(formData, "step2Enabled") === "on",
    step2DelayDays: formData.get("step2DelayDays"),
    step2Subject: formString(formData, "step2Subject"),
    step2Body: formString(formData, "step2Body"),
    step3Enabled: formString(formData, "step3Enabled") === "on",
    step3DelayDays: formData.get("step3DelayDays"),
    step3Subject: formString(formData, "step3Subject"),
    step3Body: formString(formData, "step3Body"),
    autoApproveFollowups: formString(formData, "autoApproveFollowups") === "on",
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid campaign.", 422);
  if (
    (parsed.data.step2Enabled && (!parsed.data.step2Subject || !parsed.data.step2Body)) ||
    (parsed.data.step3Enabled && (!parsed.data.step3Subject || !parsed.data.step3Body))
  ) throw new AppError("Enabled follow-up steps need both a subject and body.", 422);

  await db.insert(inboxAccounts).values({ id: parsed.data.senderAccountId }).onConflictDoNothing();
  const sequence = [
    {
      delayDays: parsed.data.step2DelayDays,
      subject: parsed.data.step2Subject,
      body: parsed.data.step2Body,
      enabled: parsed.data.step2Enabled,
    },
    {
      delayDays: parsed.data.step3DelayDays,
      subject: parsed.data.step3Subject,
      body: parsed.data.step3Body,
      enabled: parsed.data.step3Enabled,
    },
  ];
  let campaignId = parsed.data.id;
  if (campaignId) {
    const [updated] = await db.update(outreachCampaigns).set({
      name: parsed.data.name,
      senderAccountId: parsed.data.senderAccountId,
      subjectTemplate: parsed.data.subjectTemplate,
      bodyTemplate: parsed.data.bodyTemplate,
      followupSequence: sequence,
      autoApproveFollowups: parsed.data.autoApproveFollowups,
      updatedAt: new Date(),
    }).where(and(eq(outreachCampaigns.id, campaignId), eq(outreachCampaigns.status, "draft")))
      .returning({ id: outreachCampaigns.id });
    if (!updated) throw new ConflictError("Only draft campaigns can be edited.");
    campaignId = updated.id;
  } else {
    const [created] = await db.insert(outreachCampaigns).values({
      name: parsed.data.name,
      senderAccountId: parsed.data.senderAccountId,
      subjectTemplate: parsed.data.subjectTemplate,
      bodyTemplate: parsed.data.bodyTemplate,
      followupSequence: sequence,
      autoApproveFollowups: parsed.data.autoApproveFollowups,
      createdByUserId: admin.id,
    }).returning({ id: outreachCampaigns.id });
    if (!created) throw new Error("Campaign could not be saved.");
    campaignId = created.id;
  }
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.campaign_saved",
    entityType: "outreach_campaign",
    entityId: campaignId,
    description: "Outreach campaign saved as a draft.",
  });
  revalidatePath("/admin/assistant/campaigns");
  redirect(`/admin/assistant/campaigns?edit=${campaignId}`);
}

export async function saveCampaignAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => saveCampaignImpl(formData));
}

async function activateCampaignImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = z.object({
    campaignId: z.uuid(),
    leadIds: z.array(z.uuid()).min(1).max(1000),
  }).safeParse({
    campaignId: formString(formData, "campaignId"),
    leadIds: formData.getAll("leadIds"),
  });
  if (!parsed.success) throw new AppError("Select a campaign and one or more leads.", 422);
  const [campaign] = await db.select().from(outreachCampaigns)
    .where(and(eq(outreachCampaigns.id, parsed.data.campaignId), eq(outreachCampaigns.status, "draft")))
    .limit(1);
  if (!campaign) throw new NotFoundError("Draft campaign not found.");
  const [legal] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  const address = legal ? outreachBusinessAddress(legal) : "";
  const legalName = legal?.legalCompanyName?.trim() ?? "";
  const blockers = campaignActivationBlockReasons({
    legalName,
    businessAddress: address,
    bodyTemplate: campaign.bodyTemplate,
  });
  for (const step of campaign.followupSequence ?? []) {
    if (!step.enabled) continue;
    blockers.push(...campaignActivationBlockReasons({
      legalName,
      businessAddress: address,
      bodyTemplate: step.body,
    }));
  }
  if (blockers.length) throw new AppError(blockers.join(" "), 422, "campaign_activation_blocked");

  const credentials = getMailAccountCredentials()
    .find((account) => account.id === campaign.senderAccountId);
  if (!credentials) throw new AppError(`The ${campaign.senderAccountId} sender account is not configured.`, 503);
  const leads = await db.select().from(companyLeads)
    .where(inArray(companyLeads.id, [...new Set(parsed.data.leadIds)]));
  if (leads.length !== new Set(parsed.data.leadIds).size) {
    throw new NotFoundError("One or more selected leads no longer exist.");
  }

  const now = new Date();
  const unsubscribeBase = `${getEnv().APP_URL.replace(/\/+$/, "")}/api/unsubscribe/`;
  const selectedLeadIds = [...new Set(parsed.data.leadIds)];
  const sentRows = await db.select({ leadId: campaignMessages.leadId })
    .from(campaignMessages)
    .where(and(
      inArray(campaignMessages.leadId, selectedLeadIds),
      eq(campaignMessages.status, "sent"),
    ));
  const leadsWithSentMessage = new Set(sentRows.map((row) => row.leadId));
  let queued = 0;
  let firstEmails = 0;
  let followUps = 0;
  for (const lead of leads) {
    const emailValid = z.email().safeParse(lead.email).success;
    const [suppressed] = await db.select({ id: suppressedEmails.id })
      .from(suppressedEmails)
      .where(sql`lower(${suppressedEmails.email}) = ${lead.email.toLocaleLowerCase("en")}`)
      .limit(1);
    const recentCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const [recentSend] = await db.select({ id: campaignMessages.id })
      .from(campaignMessages)
      .where(and(
        eq(campaignMessages.leadId, lead.id),
        eq(campaignMessages.status, "sent"),
        gt(campaignMessages.sentAt, recentCutoff),
      ))
      .limit(1);
    const [reply] = await db.select({ id: inboxMessages.id })
      .from(inboxThreads)
      .innerJoin(inboxMessages, eq(inboxMessages.threadId, inboxThreads.id))
      .where(and(
        eq(inboxThreads.leadId, lead.id),
        eq(inboxMessages.direction, "inbound"),
      ))
      .limit(1);
    const plan = planCampaignStep({
      now,
      email: lead.email,
      emailValid,
      suppressed: Boolean(suppressed),
      doNotContact: lead.doNotContact,
      status: lead.status,
      lastContactedAt: lead.lastContactedAt,
      hasReplied: Boolean(reply) || lead.status === "replied",
      emailedWithin14Days: Boolean(recentSend) || Boolean(
        lead.lastContactedAt &&
        lead.lastContactedAt.getTime() > now.getTime() - 14 * 24 * 60 * 60 * 1000,
      ),
      hasSentCampaignMessage: leadsWithSentMessage.has(lead.id),
      followupSequence: campaign.followupSequence ?? [],
    });
    if (plan.action === "blocked" || plan.action === "skipped") continue;

    const token = signUnsubscribeToken(lead.email, getEnv().SESSION_SECRET);
    const values = {
      company: lead.company,
      contact_name: lead.contactName ?? "",
      designation: lead.designation ?? "",
      city: lead.city ?? "",
      unsubscribe_url: `${unsubscribeBase}${token}`,
    };
    let subject: string;
    let body: string;
    if (plan.action === "followup") {
      const firstFollowup = (campaign.followupSequence ?? [])[0];
      if (!firstFollowup) continue;
      subject = renderCampaignTemplate(firstFollowup.subject, values);
      body = renderCampaignTemplate(firstFollowup.body, values);
    } else {
      subject = renderCampaignTemplate(campaign.subjectTemplate, values);
      body = renderCampaignTemplate(campaign.bodyTemplate, values);
    }
    const [created] = await db.insert(campaignMessages).values({
      campaignId: campaign.id,
      leadId: lead.id,
      step: plan.step,
      subject,
      body,
      status: "pending_approval",
      scheduledAt: plan.scheduledAt,
    }).onConflictDoNothing().returning({ id: campaignMessages.id });
    if (created) {
      queued += 1;
      if (plan.action === "followup") followUps += 1;
      else firstEmails += 1;
    }
  }

  if (!queued) throw new ConflictError("No selected leads passed all campaign pre-send checks.");
  await db.update(outreachCampaigns).set({ status: "active", updatedAt: now })
    .where(eq(outreachCampaigns.id, campaign.id));
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.campaign_activated",
    entityType: "outreach_campaign",
    entityId: campaign.id,
    description: `Campaign activated with ${queued} message(s) awaiting manual approval.`,
    metadata: { queued, selected: leads.length, firstEmails, followUps },
  });
  revalidatePath("/admin/assistant/campaigns");
}

export async function activateCampaignAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => activateCampaignImpl(formData));
}

async function approveCampaignMessagesImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = z.array(z.uuid()).min(1).max(100)
    .safeParse(formData.getAll("messageIds"));
  if (!parsed.success) throw new AppError("Select one or more messages awaiting approval.", 422);
  const ids = [...new Set(parsed.data)];
  const updated = await db.update(campaignMessages).set({
    status: "approved",
    approvedByUserId: admin.id,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    inArray(campaignMessages.id, ids),
    eq(campaignMessages.status, "pending_approval"),
  )).returning({ id: campaignMessages.id });
  if (!updated.length) throw new ConflictError("No selected messages are awaiting approval.");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.campaign_messages_approved",
    entityType: "campaign_message",
    description: `${updated.length} campaign message(s) approved for sending.`,
    metadata: { count: updated.length },
  });
  revalidatePath("/admin/assistant/campaigns");
}

export async function approveCampaignMessagesAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => approveCampaignMessagesImpl(formData));
}

async function pauseCampaignImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = z.object({
    campaignId: z.uuid(),
    status: z.enum(["active", "paused"]),
  }).safeParse({
    campaignId: formString(formData, "campaignId"),
    status: formString(formData, "status"),
  });
  if (!parsed.success) throw new AppError("Invalid campaign update.", 422);
  const [campaign] = await db.update(outreachCampaigns).set({
    status: parsed.data.status,
    updatedAt: new Date(),
  }).where(eq(outreachCampaigns.id, parsed.data.campaignId))
    .returning({ id: outreachCampaigns.id });
  if (!campaign) throw new NotFoundError("Campaign not found.");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: `assistant.campaign_${parsed.data.status}`,
    entityType: "outreach_campaign",
    entityId: campaign.id,
    description: `Campaign ${parsed.data.status}.`,
  });
  revalidatePath("/admin/assistant/campaigns");
}

export async function updateCampaignStatusAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => pauseCampaignImpl(formData));
}

async function sendTestImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = z.object({
    campaignId: z.uuid(),
    leadId: z.uuid(),
  }).safeParse({
    campaignId: formString(formData, "campaignId"),
    leadId: formString(formData, "leadId"),
  });
  if (!parsed.success) throw new AppError("Choose a campaign and a lead for the preview.", 422);
  const [campaign] = await db.select().from(outreachCampaigns)
    .where(eq(outreachCampaigns.id, parsed.data.campaignId)).limit(1);
  const [lead] = await db.select().from(companyLeads)
    .where(eq(companyLeads.id, parsed.data.leadId)).limit(1);
  if (!campaign || !lead) throw new NotFoundError("Campaign or preview lead not found.");
  const credentials = getMailAccountCredentials()
    .find((account) => account.id === campaign.senderAccountId);
  if (!credentials) throw new AppError(`The ${campaign.senderAccountId} sender account is not configured.`, 503);

  const [adminUser] = await db.select({ email: users.email, fullName: users.fullName })
    .from(users).where(eq(users.id, admin.id)).limit(1);
  if (!adminUser) throw new NotFoundError("Administrator account not found.");
  const token = signUnsubscribeToken(lead.email, getEnv().SESSION_SECRET);
  const body = renderCampaignTemplate(campaign.bodyTemplate, {
    company: lead.company,
    contact_name: lead.contactName ?? "",
    designation: lead.designation ?? "",
    city: lead.city ?? "",
    unsubscribe_url: `${getEnv().APP_URL.replace(/\/+$/, "")}/api/unsubscribe/${token}`,
  });
  const subject = `[TEST] ${renderCampaignTemplate(campaign.subjectTemplate, {
    company: lead.company,
    contact_name: lead.contactName ?? "",
    designation: lead.designation ?? "",
    city: lead.city ?? "",
    unsubscribe_url: "",
  })}`;
  const address = (await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1))[0];
  const legalName = address?.legalCompanyName?.trim() ?? "";
  const physicalAddress = address ? outreachBusinessAddress(address) : "";
  const transporter = createTransport({
    host: credentials.smtp.host,
    port: credentials.smtp.port,
    secure: credentials.smtp.secure,
    requireTLS: credentials.smtp.requireTLS,
    auth: { user: credentials.username, pass: credentials.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  try {
    await transporter.sendMail({
      from: { name: legalName || credentials.address, address: credentials.address },
      to: { address: adminUser.email, name: adminUser.fullName },
      subject,
      text: `${body}\n\n${legalName}\n${physicalAddress}`,
    });
  } finally {
    transporter.close();
  }
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.campaign_test_sent",
    entityType: "outreach_campaign",
    entityId: campaign.id,
    description: "Campaign test message sent to the administrator.",
    metadata: { recipient: adminUser.email },
  });
  revalidatePath("/admin/assistant/campaigns");
}

export async function sendCampaignTestAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => sendTestImpl(formData));
}
