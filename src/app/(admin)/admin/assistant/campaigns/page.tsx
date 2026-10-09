import Link from "next/link";
import { count, desc, eq, inArray } from "drizzle-orm";
import { Alert, Badge, Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import {
  campaignMessages,
  companyLeads,
  outreachCampaigns,
} from "@/lib/db/schema";
import { getMailAccountStatuses } from "@/lib/assistant/mail-accounts";
import { renderCampaignTemplate } from "@/lib/assistant/campaign-rules";
import { signUnsubscribeToken } from "@/lib/assistant/unsubscribe-token";
import { getEnv } from "@/lib/env";
import {
  activateCampaignAction,
  approveCampaignMessagesAction,
  saveCampaignAction,
  sendCampaignTestAction,
  updateCampaignStatusAction,
} from "@/lib/assistant/campaign-actions";
import { formatDateTime } from "@/lib/utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

type SearchParams = { edit?: string };

export default async function AssistantCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const editId = z.uuid().safeParse(params.edit).success ? params.edit : undefined;
  const [campaigns, leads, pendingMessages, selected] = await Promise.all([
    db.select().from(outreachCampaigns).orderBy(desc(outreachCampaigns.updatedAt)).limit(100),
    db.select({
      id: companyLeads.id,
      company: companyLeads.company,
      contactName: companyLeads.contactName,
      designation: companyLeads.designation,
      email: companyLeads.email,
      city: companyLeads.city,
      status: companyLeads.status,
      doNotContact: companyLeads.doNotContact,
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
  const statuses = getMailAccountStatuses();
  const configuredAccounts = statuses.filter((item) => item.configured);
  const previewLead = leads[0];
  const previewValues = previewLead ? {
    company: previewLead.company,
    contact_name: previewLead.contactName ?? "",
    designation: previewLead.designation ?? "",
    city: previewLead.city ?? "",
    unsubscribe_url: `${getEnv().APP_URL.replace(/\/+$/, "")}/api/unsubscribe/${signUnsubscribeToken(previewLead.email, getEnv().SESSION_SECRET)}`,
  } : null;
  const followups = campaign?.followupSequence ?? [];
  const step2 = followups[0];
  const step3 = followups[1];

  return (
    <div className="space-y-6">
      <PageHeader title="Cold email campaigns" description="Prepare outreach to manually-added contacts. Every message requires explicit approval before sending." />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-royal hover:underline" href="/admin/assistant">Inbox</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/leads">Company leads</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/campaigns">Campaigns</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/settings">Settings and FAQ</Link>
      </nav>

      {!configuredAccounts.length ? (
        <Alert tone="warning" title="No sender account is configured">
          Campaigns can be drafted, but activation and sending require a configured support or Gmail account in the server environment.
        </Alert>
      ) : null}
      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-navy">{campaign ? "Edit draft campaign" : "Create campaign"}</h2>
        {campaign?.status !== undefined && campaign.status !== "draft" ? (
          <Alert tone="info">This campaign is {campaign.status}; its content is locked. Create a new draft to change the templates.</Alert>
        ) : (
          <form action={saveCampaignAction} className="space-y-4">
            {campaign ? <input name="id" type="hidden" value={campaign.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-navy">Campaign name<Input className="mt-1" maxLength={200} name="name" required defaultValue={campaign?.name ?? ""} /></label>
              <label className="text-sm font-semibold text-navy">Sender account<Select className="mt-1" name="senderAccountId" defaultValue={campaign?.senderAccountId ?? "gmail"}>{statuses.map((account) => <option key={account.id} value={account.id}>{account.id}{account.configured ? "" : " (Not configured)"}</option>)}</Select></label>
              <label className="text-sm font-semibold text-navy sm:col-span-2">Subject template<Input className="mt-1" maxLength={998} name="subjectTemplate" required defaultValue={campaign?.subjectTemplate ?? "A hiring resource for {{company}}"} /></label>
              <label className="text-sm font-semibold text-navy sm:col-span-2">First email body<Textarea className="mt-1" maxLength={20_000} name="bodyTemplate" required defaultValue={campaign?.bodyTemplate ?? "Hi {{contact_name}},\n\nI am reaching out about hiring at {{company}} in {{city}}.\n\nIf you do not want to receive further emails, unsubscribe here: {{unsubscribe_url}}"} rows={8} /></label>
            </div>
            <p className="text-xs text-slate-500">Variables: {"{{company}}, {{contact_name}}, {{designation}}, {{city}}"}; include an explicit unsubscribe line with {"{{unsubscribe_url}}"} to activate.</p>
            <details className="rounded-xl border border-slate-200 p-4" open={Boolean(step2 || step3)}>
              <summary className="cursor-pointer font-semibold text-navy">Follow-up sequence (step 2 after 3 days; step 3 after 7 days from step 1)</summary>
              <div className="mt-4 grid gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-navy"><input defaultChecked={step2?.enabled ?? false} name="step2Enabled" type="checkbox" /> Enable step 2</label>
                <label className="text-sm font-medium text-slate-700">Step 2 delay in days<Input defaultValue={step2?.delayDays ?? 3} max={60} min={1} name="step2DelayDays" required type="number" /></label>
                <Input aria-label="Step 2 subject" defaultValue={step2?.subject ?? "Following up"} maxLength={998} name="step2Subject" placeholder="Step 2 subject" />
                <Textarea aria-label="Step 2 body" defaultValue={step2?.body ?? "Hi {{contact_name}},\n\nA quick follow-up about {{company}}. Opt out: {{unsubscribe_url}}"} maxLength={20_000} name="step2Body" rows={5} />
                <label className="flex items-center gap-2 text-sm font-semibold text-navy"><input defaultChecked={step3?.enabled ?? false} name="step3Enabled" type="checkbox" /> Enable step 3</label>
                <label className="text-sm font-medium text-slate-700">Step 3 delay in days from step 1<Input defaultValue={step3?.delayDays ?? 7} max={60} min={1} name="step3DelayDays" required type="number" /></label>
                <Input aria-label="Step 3 subject" defaultValue={step3?.subject ?? "One last note"} maxLength={998} name="step3Subject" placeholder="Step 3 subject" />
                <Textarea aria-label="Step 3 body" defaultValue={step3?.body ?? "Hi {{contact_name}},\n\nOne last note about {{company}}. Opt out: {{unsubscribe_url}}"} maxLength={20_000} name="step3Body" rows={5} />
              </div>
            </details>
            <label className="flex items-center gap-2 text-sm font-semibold text-navy">
              <input defaultChecked={campaign?.autoApproveFollowups ?? false} name="autoApproveFollowups" type="checkbox" />
              Auto-approve follow-ups after I approve the first email
            </label>
            <Button type="submit">Save draft</Button>
          </form>
        )}
      </Card>

      {campaign?.status === "draft" ? (
        <>
          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-navy">Preview and send a test</h2>
            {previewLead ? (
              <>
                <p className="text-sm text-slate-600">Preview uses a real lead: {previewLead.company} · {previewLead.email}. Test messages go only to your administrator account.</p>
                <div className="rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold text-navy">{previewValues ? renderCampaignTemplate(campaign.subjectTemplate, previewValues) : campaign.subjectTemplate}</p><p className="mt-2 whitespace-pre-wrap text-slate-700">{previewValues ? renderCampaignTemplate(campaign.bodyTemplate, previewValues) : campaign.bodyTemplate}</p></div>
                <form action={sendCampaignTestAction} className="flex flex-wrap items-end gap-3">
                  <input name="campaignId" type="hidden" value={campaign.id} />
                  <label className="text-sm font-semibold text-navy">Preview lead<Select className="mt-1" name="leadId">{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.company} — {lead.email}</option>)}</Select></label>
                  <Button size="sm" type="submit" variant="secondary">Send a test to myself</Button>
                </form>
              </>
            ) : <p className="text-sm text-slate-600">Add a lead to preview this campaign.</p>}
          </Card>
          <Card className="space-y-4">
            <h2 className="text-lg font-bold text-navy">Choose leads to activate</h2>
            <p className="text-sm text-slate-600">Activation checks each selected lead and queues only eligible first-step messages for manual approval. Up to 1,000 leads can be selected.</p>
            {leads.length ? (
              <form action={activateCampaignAction} className="space-y-3">
                <input name="campaignId" type="hidden" value={campaign.id} />
                <div className="max-h-80 space-y-2 overflow-auto rounded-xl border border-slate-200 p-3">
                  {leads.map((lead) => (
                    <label className={`flex items-center gap-2 text-sm ${lead.doNotContact || lead.status === "bounced" || lead.status === "rejected" ? "text-slate-400" : "text-slate-700"}`} key={lead.id}>
                      <input disabled={lead.doNotContact || lead.status === "bounced" || lead.status === "rejected"} name="leadIds" type="checkbox" value={lead.id} />
                      {lead.company} · {lead.contactName ?? lead.email} · {lead.status.replaceAll("_", " ")}
                    </label>
                  ))}
                </div>
                <Button type="submit">Activate and queue for approval</Button>
              </form>
            ) : <p className="text-sm text-slate-600">No leads are available. Add them manually or import a CSV first.</p>}
          </Card>
        </>
      ) : null}

      {campaigns.length ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Campaigns and stats</h2>
          <div className="space-y-3">
            {campaigns.map((item) => {
              const stats = countsByCampaign.get(item.id);
              return (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4" key={item.id}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-navy">{item.name}</p><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status}</Badge></div>
                    <p className="mt-1 text-xs text-slate-500">{item.senderAccountId} · queued {(stats?.get("pending_approval") ?? 0) + (stats?.get("approved") ?? 0)} · sent {stats?.get("sent") ?? 0} · replied {stats?.get("replied") ?? 0} · bounced {stats?.get("bounced") ?? 0} · opted out {stats?.get("opted_out") ?? 0}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.status === "draft" ? <Link className="text-sm font-semibold text-royal hover:underline" href={`/admin/assistant/campaigns?edit=${item.id}`}>Edit</Link> : null}
                    {item.status === "active" || item.status === "paused" ? (
                      <form action={updateCampaignStatusAction}><input name="campaignId" type="hidden" value={item.id} /><input name="status" type="hidden" value={item.status === "active" ? "paused" : "active"} /><Button size="sm" type="submit" variant="secondary">{item.status === "active" ? "Pause" : "Resume"}</Button></form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-navy">Manual approval queue</h2>
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
