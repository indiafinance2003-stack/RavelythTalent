"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTransport } from "nodemailer";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { adminFormErrorUrl } from "@/lib/admin/form-error-message";
import { db } from "@/lib/db";
import {
  auditLogs,
  campaignMessages,
  companyLeads,
  inboxAccounts,
  outreachCampaigns,
  siteSettings,
  users,
} from "@/lib/db/schema";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { getEnv } from "@/lib/env";
import { getMailAccountCredentials } from "./mail-accounts";
import {
  campaignActivationBlockReasons,
  campaignDeletionDecision,
  outreachBusinessAddress,
  renderCampaignTemplate,
} from "./campaign-rules";
import { evaluateLeadsForCampaign } from "./campaign-eligibility";
import {
  ACTIVATION_SELECTION_ERROR,
  activationFormSchema,
  parseCampaignForm,
  parseDeleteCampaignForm,
  parseDuplicateCampaignForm,
} from "./campaign-form";
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

function campaignEditPath(id: string): string {
  return `/admin/assistant/campaigns?edit=${id}`;
}

export type ActivationSummary = {
  queued: number;
  skipped: number;
  firstEmails: number;
  followUps: number;
  selected: number;
  skipReasons: Array<{ reason: string; count: number }>;
};

function addSkipReason(map: Map<string, number>, reason: string): void {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

/* -------------------------------------------------------------------------- */
/* Save (draft/paused) and save + activate                                    */
/* -------------------------------------------------------------------------- */

async function saveCampaignImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = parseCampaignForm(formData);
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
      followsUpPrevious: parsed.data.followsUpPrevious,
      minDaysSinceLastContact: parsed.data.minDaysSinceLastContact,
      updatedAt: new Date(),
    }).where(and(
      eq(outreachCampaigns.id, campaignId),
      inArray(outreachCampaigns.status, ["draft", "paused"]),
    )).returning({ id: outreachCampaigns.id });
    if (!updated) throw new ConflictError("Only draft or paused campaigns can be edited.");
    campaignId = updated.id;
  } else {
    const [created] = await db.insert(outreachCampaigns).values({
      name: parsed.data.name,
      senderAccountId: parsed.data.senderAccountId,
      subjectTemplate: parsed.data.subjectTemplate,
      bodyTemplate: parsed.data.bodyTemplate,
      followupSequence: sequence,
      autoApproveFollowups: parsed.data.autoApproveFollowups,
      followsUpPrevious: parsed.data.followsUpPrevious,
      minDaysSinceLastContact: parsed.data.minDaysSinceLastContact,
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
    description: "Outreach campaign saved.",
  });
  revalidatePath("/admin/assistant/campaigns");

  if (formString(formData, "intent") === "activate") {
    let summary: ActivationSummary | null = null;
    let activationError: unknown = null;
    try {
      summary = await activateCampaignImpl(formData, campaignId);
    } catch (error) {
      activationError = error;
    }
    if (activationError) {
      const url = adminFormErrorUrl(campaignEditPath(campaignId), activationError);
      if (url) redirect(url);
      throw activationError;
    }
    if (summary) {
      redirect(`${campaignEditPath(campaignId)}&activated=1`);
    }
  }
  redirect(`${campaignEditPath(campaignId)}&saved=1`);
}

export async function saveCampaignAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formString(formData, "id") || undefined);
  const path = id.success ? campaignEditPath(id.data) : "/admin/assistant/campaigns";
  return runAdminFormAction(path, () => saveCampaignImpl(formData));
}

/* -------------------------------------------------------------------------- */
/* Activation                                                                 */
/* -------------------------------------------------------------------------- */

async function activateCampaignImpl(
  formData: FormData,
  campaignIdOverride?: string,
): Promise<ActivationSummary> {
  const admin = await adminActor();
  const parsed = activationFormSchema.safeParse({
    campaignId: campaignIdOverride ?? (formString(formData, "campaignId") || undefined),
    leadIds: formData.getAll("leadIds"),
  });
  if (!parsed.success) throw new AppError(ACTIVATION_SELECTION_ERROR, 422);

  const [campaign] = await db.select().from(outreachCampaigns)
    .where(and(
      eq(outreachCampaigns.id, parsed.data.campaignId),
      inArray(outreachCampaigns.status, ["draft", "paused"]),
    ))
    .limit(1);
  if (!campaign) throw new NotFoundError("Draft or paused campaign not found.");

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

  const selectedLeadIds = [...new Set(parsed.data.leadIds)];
  const leads = await db.select().from(companyLeads)
    .where(inArray(companyLeads.id, selectedLeadIds));
  if (leads.length !== selectedLeadIds.length) {
    throw new NotFoundError("One or more selected leads no longer exist.");
  }

  const now = new Date();
  const unsubscribeBase = `${getEnv().APP_URL.replace(/\/+$/, "")}/api/unsubscribe/`;
  const evaluated = await evaluateLeadsForCampaign(campaign, leads, now);

  const skipReasons = new Map<string, number>();
  let queued = 0;
  let firstEmails = 0;
  let followUps = 0;
  for (const lead of evaluated) {
    const plan = lead.plan;
    if (!lead.eligible || (plan.action !== "first_email" && plan.action !== "followup")) {
      const reason = lead.reasons[0] ?? "This lead is not eligible for outreach.";
      addSkipReason(skipReasons, reason);
      continue;
    }
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
      if (!firstFollowup) {
        addSkipReason(skipReasons, "Follow-up step 1 is not configured for this campaign.");
        continue;
      }
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
    } else {
      addSkipReason(skipReasons, "A message was already queued for this lead and step.");
    }
  }

  const summary: ActivationSummary = {
    queued,
    skipped: [...skipReasons.values()].reduce((total, value) => total + value, 0),
    firstEmails,
    followUps,
    selected: evaluated.length,
    skipReasons: [...skipReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };

  if (queued > 0) {
    await db.update(outreachCampaigns).set({ status: "active", updatedAt: now })
      .where(eq(outreachCampaigns.id, campaign.id));
  }
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.campaign_activated",
    entityType: "outreach_campaign",
    entityId: campaign.id,
    description: queued
      ? `Campaign activated with ${queued} message(s) awaiting manual approval.`
      : "Campaign activation attempt queued no messages.",
    metadata: { ...summary },
  });
  revalidatePath("/admin/assistant/campaigns");
  return summary;
}

function parseCampaignId(form: FormData): string | null {
  const parsed = z.uuid().safeParse(formString(form, "campaignId"));
  return parsed.success ? parsed.data : null;
}

export async function activateCampaignAction(formData: FormData): Promise<void> {
  const campaignId = parseCampaignId(formData);
  const path = campaignId ? campaignEditPath(campaignId) : "/admin/assistant/campaigns";
  return runAdminFormAction(path, async () => {
    await activateCampaignImpl(formData);
    if (campaignId) redirect(`${campaignEditPath(campaignId)}&activated=1`);
    redirect("/admin/assistant/campaigns?activated=1");
  });
}

/* -------------------------------------------------------------------------- */
/* Message approval                                                           */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Pause / resume / archive                                                   */
/* -------------------------------------------------------------------------- */

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

async function setArchivedImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = z.object({
    campaignId: z.uuid(),
    archived: z.enum(["true", "false"]),
  }).safeParse({
    campaignId: formString(formData, "campaignId"),
    archived: formString(formData, "archived"),
  });
  if (!parsed.success) throw new AppError("Invalid archive request.", 422);
  const archived = parsed.data.archived === "true";
  const [campaign] = await db.update(outreachCampaigns).set({
    archivedAt: archived ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(outreachCampaigns.id, parsed.data.campaignId))
    .returning({ id: outreachCampaigns.id });
  if (!campaign) throw new NotFoundError("Campaign not found.");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: archived ? "assistant.campaign_archived" : "assistant.campaign_unarchived",
    entityType: "outreach_campaign",
    entityId: campaign.id,
    description: archived ? "Campaign archived (hidden from the list)." : "Campaign restored from the archive.",
  });
  revalidatePath("/admin/assistant/campaigns");
  redirect(archived ? "/admin/assistant/campaigns?archived=1" : "/admin/assistant/campaigns");
}

export async function setCampaignArchivedAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => setArchivedImpl(formData));
}

/* -------------------------------------------------------------------------- */
/* Delete and duplicate                                                       */
/* -------------------------------------------------------------------------- */

async function deleteCampaignImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = parseDeleteCampaignForm(formData);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid delete request.", 422);
  const [campaign] = await db.select().from(outreachCampaigns)
    .where(eq(outreachCampaigns.id, parsed.data.campaignId)).limit(1);
  if (!campaign) throw new NotFoundError("Campaign not found.");
  if (parsed.data.confirmName !== campaign.name.trim()) {
    throw new AppError("The typed name does not match this campaign. Type the campaign name exactly to confirm deletion.", 422);
  }
  const statusRows = await db.select({ status: campaignMessages.status })
    .from(campaignMessages)
    .where(eq(campaignMessages.campaignId, campaign.id));
  const decision = campaignDeletionDecision({ messageStatuses: statusRows.map((row) => row.status) });
  if (!decision.allowed) {
    throw new AppError(decision.reason ?? "This campaign cannot be deleted.", 409, "campaign_has_sent_messages");
  }
  await db.transaction(async (tx) => {
    await tx.delete(campaignMessages).where(eq(campaignMessages.campaignId, campaign.id));
    await tx.delete(outreachCampaigns).where(eq(outreachCampaigns.id, campaign.id));
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: "assistant.campaign_deleted",
      entityType: "outreach_campaign",
      entityId: campaign.id,
      description: `Campaign "${campaign.name}" deleted with ${statusRows.length} unsent message(s).`,
      metadata: { name: campaign.name, messages: statusRows.length },
    });
  });
  revalidatePath("/admin/assistant/campaigns");
  redirect("/admin/assistant/campaigns?deleted=1");
}

export async function deleteCampaignAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => deleteCampaignImpl(formData));
}

async function duplicateCampaignImpl(formData: FormData): Promise<void> {
  const admin = await adminActor();
  const parsed = parseDuplicateCampaignForm(formData);
  if (!parsed.success) throw new AppError("Invalid duplicate request.", 422);
  const [campaign] = await db.select().from(outreachCampaigns)
    .where(eq(outreachCampaigns.id, parsed.data.campaignId)).limit(1);
  if (!campaign) throw new NotFoundError("Campaign not found.");
  const [created] = await db.insert(outreachCampaigns).values({
    name: `${campaign.name} (copy)`.slice(0, 200),
    senderAccountId: campaign.senderAccountId,
    status: "draft",
    subjectTemplate: campaign.subjectTemplate,
    bodyTemplate: campaign.bodyTemplate,
    followupSequence: campaign.followupSequence,
    autoApproveFollowups: campaign.autoApproveFollowups,
    followsUpPrevious: campaign.followsUpPrevious,
    minDaysSinceLastContact: campaign.minDaysSinceLastContact,
    createdByUserId: admin.id,
  }).returning({ id: outreachCampaigns.id });
  if (!created) throw new AppError("The campaign could not be duplicated.", 500);
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.campaign_duplicated",
    entityType: "outreach_campaign",
    entityId: created.id,
    description: `Campaign duplicated from "${campaign.name}".`,
    metadata: { sourceCampaignId: campaign.id },
  });
  revalidatePath("/admin/assistant/campaigns");
  redirect(`${campaignEditPath(created.id)}&duplicated=1`);
}

export async function duplicateCampaignAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/campaigns", () => duplicateCampaignImpl(formData));
}

/* -------------------------------------------------------------------------- */
/* Test send                                                                  */
/* -------------------------------------------------------------------------- */

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
