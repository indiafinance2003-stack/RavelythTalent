import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Alert, Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui/primitives";
import { CampaignEditor } from "@/components/admin/assistant/campaign-editor";
import {
  CampaignLeadSelector,
  type CampaignLeadOption,
} from "@/components/admin/assistant/campaign-lead-selector";
import { db } from "@/lib/db";
import {
  auditLogs,
  campaignMessages,
  companyLeads,
  outreachCampaigns,
} from "@/lib/db/schema";
import { getMailAccountStatuses } from "@/lib/assistant/mail-accounts";
import { renderCampaignTemplate } from "@/lib/assistant/campaign-rules";
import { evaluateLeadsForCampaign } from "@/lib/assistant/campaign-eligibility";
import { signUnsubscribeToken } from "@/lib/assistant/unsubscribe-token";
import { getEnv } from "@/lib/env";
import {
  activateCampaignAction,
  approveCampaignMessagesAction,
  deleteCampaignAction,
  duplicateCampaignAction,
  sendCampaignTestAction,
  setCampaignArchivedAction,
  updateCampaignStatusAction,
} from "@/lib/assistant/campaign-actions";
import { formatDateTime } from "@/lib/utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

type SearchParams = {
  edit?: string;
  saved?: string;
  activated?: string;
  duplicated?: string;
  deleted?: string;
  archived?: string;
  showArchived?: string;
};

type ActivationSummaryMetadata = {
  queued?: number;
  skipped?: number;
  firstEmails?: number;
  followUps?: number;
  selected?: number;
  skipReasons?: Array<{ reason: string; count: number }>;
};

export default async function AssistantCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const editId = z.uuid().safeParse(params.edit).success ? params.edit : undefined;
  const showArchived = params.showArchived === "1";

  const [campaigns, archivedCountRow, leads, pendingMessages, selected] = await Promise.all([
    db.select().from(outreachCampaigns)
      .where(showArchived ? undefined : isNull(outreachCampaigns.archivedAt))
      .orderBy(desc(outreachCampaigns.updatedAt))
      .limit(100),
    db.select({ total: count() }).from(outreachCampaigns)
      .where(isNotNull(outreachCampaigns.archivedAt)),
    db.select({
      id: companyLeads.id,
      company: companyLeads.company,
      contactName: companyLeads.contactName,
      designation: companyLeads.designation,
      email: companyLeads.email,
      city: companyLeads.city,
      status: companyLeads.status,
      doNotContact: companyLeads.doNotContact,
      lastContactedAt: companyLeads.lastContactedAt,
    }).from(companyLeads).orderBy(desc(companyLeads.updatedAt)).limit(1000),
    db.select({
      message: campaignMessages,
      campaign: outreachCampaigns,
      lead: companyLeads,
    }).from(campaignMessages)
      .innerJoin(outreachCampaigns, eq(outreachCampaigns.id, campaignMessages.campaignId))
      .innerJoin(companyLeads, eq(companyLeads.id, campaignMessages.leadId))
      .where(inArray(campaignMessages.status, ["pending_approval", "approved", "failed"]))
      .orderBy(desc(campaignMessages.createdAt))
      .limit(200),
    editId
      ? db.select().from(outreachCampaigns).where(eq(outreachCampaigns.id, editId)).limit(1)
      : Promise.resolve([]),
  ]);

  const campaign = selected[0];
  const editable = campaign?.status === "draft" || campaign?.status === "paused";

  const [activationAudit] = editId
    ? await db.select({ metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.action, "assistant.campaign_activated"),
        eq(auditLogs.entityType, "outreach_campaign"),
        eq(auditLogs.entityId, editId),
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)
    : [];
  const activationSummary = (activationAudit?.metadata ?? undefined) as
    | ActivationSummaryMetadata
    | undefined;

  const campaignIds = campaigns.map((item) => item.id);
  const messageCounts = campaignIds.length
    ? await db.select({
      campaignId: campaignMessages.campaignId,
      status: campaignMessages.status,
      total: count(),
    }).from(campaignMessages)
      .where(inArray(campaignMessages.campaignId, campaignIds))
      .groupBy(campaignMessages.campaignId, campaignMessages.status)
    : [];
  const countsByCampaign = new Map<string, Map<string, number>>();
  for (const row of messageCounts) {
    const counts = countsByCampaign.get(row.campaignId) ?? new Map<string, number>();
    counts.set(row.status, row.total);
    countsByCampaign.set(row.campaignId, counts);
  }

  const evaluated = campaign && editable
    ? await evaluateLeadsForCampaign(campaign, leads, new Date())
    : [];
  const leadOptions: CampaignLeadOption[] = evaluated.map((lead) => ({
    id: lead.id,
    label: `${lead.company} · ${lead.contactName ?? lead.email}`,
    status: lead.status,
    eligible: lead.eligible,
    reason: lead.reasons[0] ?? null,
    eligibleFrom: lead.eligibleFrom ? formatDateTime(lead.eligibleFrom) : null,
  }));

  const statuses = getMailAccountStatuses();
  const configuredAccounts = statuses.filter((item) => item.configured);
  const previewLead = leads[0];
  const previewValues = previewLead && campaign ? {
    company: previewLead.company,
    contact_name: previewLead.contactName ?? "",
    designation: previewLead.designation ?? "",
    city: previewLead.city ?? "",
    unsubscribe_url: `${getEnv().APP_URL.replace(/\/+$/, "")}/api/unsubscribe/${signUnsubscribeToken(previewLead.email, getEnv().SESSION_SECRET)}`,
  } : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Cold email campaigns" description="Prepare outreach to manually-added contacts. Every message requires explicit approval before sending." />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-royal hover:underline" href="/admin/assistant">Inbox</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/leads">Company leads</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/campaigns">Campaigns</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/settings">Settings and FAQ</Link>
      </nav>

      {params.saved ? <Alert tone="success">Campaign saved.</Alert> : null}
      {params.activated ? <Alert tone="success">Activation finished. See the result below.</Alert> : null}
      {params.duplicated ? <Alert tone="success">Campaign duplicated into a new draft.</Alert> : null}
      {params.deleted ? <Alert tone="success">Campaign deleted.</Alert> : null}
      {params.archived ? <Alert tone="success">Campaign archived. Hide it from this list to keep it out of the way.</Alert> : null}

      {!configuredAccounts.length ? (
        <Alert tone="warning" title="No sender account is configured">
          Campaigns can be drafted, but activation and sending require a configured support or Gmail account in the server environment.
        </Alert>
      ) : null}

      {campaign ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-navy">{campaign.name}</h2>
                <Badge tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "neutral"}>
                  {campaign.status}
                </Badge>
                {campaign.archivedAt ? <Badge tone="neutral">archived</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">Sender: {campaign.senderAccountId} · updated {formatDateTime(campaign.updatedAt)}</p>
            </div>
            <Link className="text-sm font-semibold text-royal hover:underline" href="/admin/assistant/campaigns">← All campaigns</Link>
          </div>
          {campaign.status === "active" ? (
            <Alert tone="info">This campaign is active and its content is locked. Pause it to make changes.</Alert>
          ) : null}
          {campaign.status === "paused" ? (
            <Alert tone="warning">This campaign is paused. You can edit it and activate it again when ready.</Alert>
          ) : null}
        </Card>
      ) : null}

      {campaign && activationSummary ? (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Last activation result</h2>
          <p className="text-sm text-slate-700">
            Queued <strong>{activationSummary.queued ?? 0}</strong> of {activationSummary.selected ?? 0} selected
            ({activationSummary.firstEmails ?? 0} first emails, {activationSummary.followUps ?? 0} follow-ups). Skipped {activationSummary.skipped ?? 0}.
          </p>
          {activationSummary.skipReasons?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {activationSummary.skipReasons.map((item) => (
                <li key={item.reason}>{item.count} × {item.reason}</li>
              ))}
            </ul>
          ) : null}
          <Link className="text-sm font-semibold text-royal hover:underline" href="/admin/assistant/campaigns#approval-queue">
            Go to the approval queue →
          </Link>
        </Card>
      ) : null}

      {campaign && editable ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Edit campaign</h2>
          <CampaignEditor allowActivate campaign={campaign} statuses={statuses} />
        </Card>
      ) : null}

      {campaign && editable && previewLead ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Preview and send a test</h2>
          <p className="text-sm text-slate-600">Preview uses a real lead: {previewLead.company} · {previewLead.email}. Test messages go only to your administrator account.</p>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-navy">{previewValues ? renderCampaignTemplate(campaign.subjectTemplate, previewValues) : campaign.subjectTemplate}</p>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">{previewValues ? renderCampaignTemplate(campaign.bodyTemplate, previewValues) : campaign.bodyTemplate}</p>
          </div>
          <form action={sendCampaignTestAction} className="flex flex-wrap items-end gap-3">
            <input name="campaignId" type="hidden" value={campaign.id} />
            <label className="text-sm font-semibold text-navy">
              Preview lead
              <Select className="mt-1" name="leadId">
                {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.company} — {lead.email}</option>)}
              </Select>
            </label>
            <Button size="sm" type="submit" variant="secondary">Send a test to myself</Button>
          </form>
        </Card>
      ) : null}

      {campaign && editable ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Choose leads to activate</h2>
          <p className="text-sm text-slate-600">
            Activation checks each selected lead and queues only eligible messages for manual approval. Up to 1,000 leads can be selected.
          </p>
          <CampaignLeadSelector action={activateCampaignAction} campaignId={campaign.id} leads={leadOptions} />
        </Card>
      ) : null}

      {campaign ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Manage campaign</h2>
          <div className="flex flex-wrap gap-3">
            <form action={duplicateCampaignAction}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <Button size="sm" type="submit" variant="secondary">Duplicate as new draft</Button>
            </form>
            <form action={setCampaignArchivedAction}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <input name="archived" type="hidden" value={campaign.archivedAt ? "false" : "true"} />
              <Button size="sm" type="submit" variant="secondary">{campaign.archivedAt ? "Restore from archive" : "Archive"}</Button>
            </form>
            {campaign.status === "active" || campaign.status === "paused" ? (
              <form action={updateCampaignStatusAction}>
                <input name="campaignId" type="hidden" value={campaign.id} />
                <input name="status" type="hidden" value={campaign.status === "active" ? "paused" : "active"} />
                <Button size="sm" type="submit" variant="secondary">{campaign.status === "active" ? "Pause" : "Resume"}</Button>
              </form>
            ) : null}
          </div>
          <details className="rounded-xl border border-red-200 p-4">
            <summary className="cursor-pointer font-semibold text-red-700">Delete this campaign</summary>
            <p className="mt-2 text-sm text-slate-600">
              Deletion is permanent and removes any messages that were never sent. Campaigns with sent messages cannot be deleted; pause or archive them instead.
            </p>
            <form action={deleteCampaignAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input name="campaignId" type="hidden" value={campaign.id} />
              <label className="text-sm font-semibold text-navy">
                Type &quot;{campaign.name}&quot; to confirm
                <Input className="mt-1" name="confirmName" required />
              </label>
              <Button size="sm" type="submit" variant="danger">Delete campaign</Button>
            </form>
          </details>
        </Card>
      ) : null}

      {!campaign ? (
        <>
          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-navy">Create campaign</h2>
            <CampaignEditor statuses={statuses} />
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-navy">{showArchived ? "All campaigns" : "Campaigns and stats"}</h2>
              <Link className="text-sm font-semibold text-royal hover:underline" href={showArchived ? "/admin/assistant/campaigns" : "/admin/assistant/campaigns?showArchived=1"}>
                {showArchived ? "Hide archived" : `Show archived (${archivedCountRow[0]?.total ?? 0})`}
              </Link>
            </div>
            {campaigns.length ? (
              <div className="space-y-3">
                {campaigns.map((item) => {
                  const stats = countsByCampaign.get(item.id);
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4" key={item.id}>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-navy">{item.name}</p>
                          <Badge tone={item.status === "active" ? "success" : item.status === "paused" ? "warning" : "neutral"}>{item.status}</Badge>
                          {item.archivedAt ? <Badge tone="neutral">archived</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.senderAccountId} · queued {(stats?.get("pending_approval") ?? 0) + (stats?.get("approved") ?? 0)} · sent {stats?.get("sent") ?? 0} · replied {stats?.get("replied") ?? 0} · bounced {stats?.get("bounced") ?? 0} · opted out {stats?.get("opted_out") ?? 0}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {item.status === "draft" || item.status === "paused" ? (
                          <Link className="text-sm font-semibold text-royal hover:underline" href={`/admin/assistant/campaigns?edit=${item.id}`}>Edit</Link>
                        ) : null}
                        {item.status === "active" || item.status === "paused" ? (
                          <form action={updateCampaignStatusAction}>
                            <input name="campaignId" type="hidden" value={item.id} />
                            <input name="status" type="hidden" value={item.status === "active" ? "paused" : "active"} />
                            <Button size="sm" type="submit" variant="secondary">{item.status === "active" ? "Pause" : "Resume"}</Button>
                          </form>
                        ) : null}
                        <form action={setCampaignArchivedAction}>
                          <input name="campaignId" type="hidden" value={item.id} />
                          <input name="archived" type="hidden" value={item.archivedAt ? "false" : "true"} />
                          <Button size="sm" type="submit" variant="ghost">{item.archivedAt ? "Restore" : "Archive"}</Button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-slate-600">No campaigns yet. Create one above.</p>}
          </Card>
        </>
      ) : null}

      <Card className="space-y-4" >
        <h2 className="text-lg font-bold text-navy" id="approval-queue">Manual approval queue</h2>
        <p className="text-sm text-slate-600">Nothing in this queue is sent until you approve each message or approve a selected batch.</p>
        {pendingMessages.length ? (
          <form action={approveCampaignMessagesAction} className="space-y-3">
            <div className="flex justify-end"><Button size="sm" type="submit">Approve selected</Button></div>
            <div className="space-y-3">
              {pendingMessages.map(({ message, campaign: parent, lead }) => (
                <label className="flex gap-3 rounded-xl border border-slate-200 p-3" key={message.id}>
                  <input className="mt-1" disabled={message.status !== "pending_approval"} name="messageIds" type="checkbox" value={message.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><strong className="text-navy">{parent.name}</strong><Badge tone={message.status === "failed" ? "danger" : message.status === "approved" ? "success" : "warning"}>{message.status.replaceAll("_", " ")}</Badge></span>
                    <span className="mt-1 block text-sm text-slate-700">{lead.company} · {lead.email} · step {message.step}</span>
                    <span className="mt-1 block text-sm font-semibold text-navy">{message.subject}</span>
                    <span className="mt-1 block whitespace-pre-wrap text-xs text-slate-600">{message.body}</span>
                    {message.lastError ? <span className="mt-1 block text-xs text-red-700">{message.lastError}</span> : null}
                    {message.status === "failed" ? <span className="mt-1 block text-xs text-red-700">Confirm delivery status with the sender mailbox before preparing a replacement; this message cannot be automatically retried.</span> : null}
                    {message.scheduledAt ? <span className="mt-1 block text-xs text-slate-500">Scheduled {formatDateTime(message.scheduledAt)}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </form>
        ) : <p className="text-sm text-slate-600">No messages are waiting for approval.</p>}
      </Card>
    </div>
  );
}
