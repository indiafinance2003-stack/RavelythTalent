import Link from "next/link";
import { and, count, desc, eq, gt, ilike, isNull, or } from "drizzle-orm";
import { Alert, Badge, Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { LeadCsvImport } from "@/components/admin/assistant/lead-csv-import";
import {
  changeLeadStatusAction,
  deleteLeadAction,
  saveLeadAction,
} from "@/lib/assistant/lead-actions";
import { leadStatuses } from "@/lib/assistant/leads-csv";
import { db } from "@/lib/db";
import { assistantSettings, companyLeads, leadEmailDrafts, leadEvents, suppressedEmails } from "@/lib/db/schema";
import { companies, plans, subscriptions } from "@/lib/db/schema";
import { matchesSubscribedCompany } from "@/lib/assistant/lead-subscription-match";
import {
  approveLeadEmailDraftAction,
  draftLeadEmailWithAiAction,
  updateLeadEmailDraftAction,
} from "@/lib/assistant/ai-actions";
import { getEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; status?: string; edit?: string };
const controlClass = "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-navy focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/25";

export default async function AssistantLeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 120);
  const status = leadStatuses.find((item) => item === params.status);
  const filters = [];
  if (status) filters.push(eq(companyLeads.status, status));
  if (query) {
    const term = `%${query.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(
      ilike(companyLeads.company, term),
      ilike(companyLeads.contactName, term),
      ilike(companyLeads.email, term),
    )!);
  }
  const [leads, statusCounts, totalRow, suppressions, purchases] = await Promise.all([
    db.select().from(companyLeads)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(companyLeads.updatedAt))
      .limit(100),
    db.select({ status: companyLeads.status, total: count() })
      .from(companyLeads)
      .groupBy(companyLeads.status),
    db.select({ total: count() }).from(companyLeads),
    db.select().from(suppressedEmails).orderBy(desc(suppressedEmails.createdAt)).limit(100),
    db.select({
      contactEmail: companies.contactEmail,
      website: companies.website,
      websiteDomain: companies.websiteDomain,
      companyName: companies.name,
      planName: plans.name,
    })
      .from(subscriptions)
      .innerJoin(companies, eq(companies.id, subscriptions.companyId))
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(
        eq(subscriptions.status, "active"),
        gt(subscriptions.currentPeriodEnd, new Date()),
        isNull(companies.deletedAt),
      )),
  ]);
  const total = totalRow[0]?.total ?? 0;
  const counts = new Map(statusCounts.map((row) => [row.status, row.total]));
  const editId = z.uuid().safeParse(params.edit).success ? params.edit : undefined;
  const [editing] = editId
    ? await db.select().from(companyLeads).where(eq(companyLeads.id, editId)).limit(1)
    : [];
  const subscribedSuggestions = leads.flatMap((lead) => {
    if (lead.status === "subscribed") return [];
    const company = purchases.find((purchase) => matchesSubscribedCompany(lead, purchase));
    return company ? [{ lead, company }] : [];
  });
  const [history, leadDrafts, aiSettings] = editing
    ? await Promise.all([
      db.select().from(leadEvents)
        .where(eq(leadEvents.leadId, editing.id))
        .orderBy(desc(leadEvents.createdAt))
        .limit(8),
      db.select().from(leadEmailDrafts)
        .where(eq(leadEmailDrafts.leadId, editing.id))
        .orderBy(desc(leadEmailDrafts.createdAt))
        .limit(10),
      db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)).limit(1),
    ])
    : [[], [], []];
  const env = getEnv();
  const aiEnabled = Boolean(aiSettings[0]?.aiEnabled && env.ANTHROPIC_API_KEY);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company leads"
        description="Manage only contacts added by your team. No leads are collected automatically."
        action={<Link className="text-sm font-semibold text-royal hover:underline" href="/api/admin/assistant/leads/export">Export CSV</Link>}
      />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-royal hover:underline" href="/admin/assistant">Inbox</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/leads">Company leads</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/campaigns">Campaigns</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/settings">Settings and FAQ</Link>
      </nav>
      <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Card className="p-3"><p className="text-xs text-slate-500">All leads</p><p className="font-bold text-navy">{total}</p></Card>
        {leadStatuses.map((item) => (
          <Card className="p-3" key={item}>
            <p className="text-xs capitalize text-slate-500">{item.replaceAll("_", " ")}</p>
            <p className="font-bold text-navy">{counts.get(item) ?? 0}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-navy">{editing ? "Edit lead" : "Add a lead"}</h2>
        <form action={saveLeadAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {editing ? <input name="id" type="hidden" value={editing.id} /> : null}
          <label className="text-sm font-medium text-slate-700">Company *<Input className="mt-1" maxLength={200} name="company" required defaultValue={editing?.company ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Contact name<Input className="mt-1" maxLength={200} name="contactName" defaultValue={editing?.contactName ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Designation<Input className="mt-1" maxLength={200} name="designation" defaultValue={editing?.designation ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Email *<Input className="mt-1" maxLength={320} name="email" required type="email" defaultValue={editing?.email ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Phone<Input className="mt-1" maxLength={80} name="phone" defaultValue={editing?.phone ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Website<Input className="mt-1" maxLength={500} name="website" type="url" defaultValue={editing?.website ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">City<Input className="mt-1" maxLength={120} name="city" defaultValue={editing?.city ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">State<Input className="mt-1" maxLength={120} name="state" defaultValue={editing?.state ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Industry<Input className="mt-1" maxLength={160} name="industry" defaultValue={editing?.industry ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Source<Input className="mt-1" maxLength={120} name="source" defaultValue={editing?.source ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700">Next follow-up date<Input className="mt-1" name="nextFollowupDate" type="date" defaultValue={editing?.nextFollowupAt?.toISOString().slice(0, 10) ?? ""} /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes<textarea className={`${controlClass} min-h-20`} maxLength={5000} name="notes" defaultValue={editing?.notes ?? ""} /></label>
          {editing?.doNotContact ? <Alert className="sm:col-span-2 lg:col-span-3" tone="warning">This contact opted out. Their suppression remains active and the record cannot be opted back in from this form.</Alert> : null}
          <div className="flex items-end gap-3">
            <Button type="submit">{editing ? "Save changes" : "Add lead"}</Button>
            {editing ? <Link className="pb-2 text-sm font-semibold text-royal hover:underline" href="/admin/assistant/leads">Cancel edit</Link> : null}
          </div>
        </form>
        {editing ? (
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-navy">Recent lead history</summary>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {history.map((event) => <li key={event.id}>{formatDateTime(event.createdAt)} · {event.eventType}{event.fromStatus ? ` (${event.fromStatus} → ${event.toStatus})` : ""}</li>)}
            </ul>
          </details>
        ) : null}
        {editing ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-navy">AI first-email drafts</h3>
            {aiEnabled && !editing.doNotContact && !["bounced", "rejected"].includes(editing.status) ? (
              <form action={draftLeadEmailWithAiAction} className="flex flex-wrap items-end gap-3">
                <input name="leadId" type="hidden" value={editing.id} />
                <label className="text-sm font-medium text-slate-700">Sender account<Select className="mt-1" name="accountId" defaultValue="gmail"><option value="gmail">Gmail</option><option value="support">Support</option></Select></label>
                <Button size="sm" type="submit" variant="secondary">Generate AI draft</Button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">{aiEnabled ? "This lead is not eligible for outreach." : "AI not configured — add an API key to enable AI buttons."}</p>
            )}
            {leadDrafts.map((draft) => (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3" key={draft.id}>
                <p className="text-xs font-semibold uppercase text-slate-500">Source: {draft.source} · {draft.status}</p>
                {draft.status === "draft" ? (
                  <>
                    <form action={updateLeadEmailDraftAction} className="space-y-3">
                      <input name="draftId" type="hidden" value={draft.id} />
                      <label className="block text-sm font-semibold text-navy">Subject<Input className="mt-1" maxLength={998} name="subject" required defaultValue={draft.subject} /></label>
                      <label className="block text-sm font-semibold text-navy">Body<Textarea className="mt-1" maxLength={20_000} name="body" required rows={7} defaultValue={draft.body} /></label>
                      <Button size="sm" type="submit" variant="secondary">Save reviewed draft</Button>
                    </form>
                    <form action={approveLeadEmailDraftAction}>
                      <input name="draftId" type="hidden" value={draft.id} />
                      <Button size="sm" type="submit">Approve and queue for guarded sending</Button>
                    </form>
                  </>
                ) : (
                  <><p className="whitespace-pre-wrap text-sm text-slate-700">{draft.subject}{"\n\n"}{draft.body}</p>{draft.status === "pending_approval" ? <Link className="text-sm font-semibold text-royal hover:underline" href="/admin/assistant/campaigns">Review in campaign approval queue</Link> : null}</>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <LeadCsvImport />

      {subscribedSuggestions.length ? (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Possible subscribed companies</h2>
          <p className="text-sm text-slate-600">These contacts match an active company subscription by contact email or website domain. Confirm before changing lead status.</p>
          {subscribedSuggestions.map(({ lead, company }) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3" key={lead.id}>
              <p className="text-sm text-slate-700"><span className="font-semibold text-navy">{lead.company}</span> may match {company.companyName} ({company.planName}).</p>
              <form action={changeLeadStatusAction}>
                <input name="leadIds" type="hidden" value={lead.id} />
                <input name="status" type="hidden" value="subscribed" />
                <Button size="sm" type="submit">Confirm subscribed</Button>
              </form>
            </div>
          ))}
        </Card>
      ) : null}

      <Card className="space-y-4">
        <form action="/admin/assistant/leads" className="flex flex-wrap items-end gap-3" method="get">
          <label className="min-w-56 text-sm font-semibold text-navy">Search<Input className="mt-1" name="q" defaultValue={query} placeholder="Company, contact or email" /></label>
          <label className="text-sm font-semibold text-navy">Status<Select className="mt-1" name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{leadStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select></label>
          <Button size="sm" type="submit">Filter</Button>
          <Link className="pb-2 text-sm font-semibold text-royal hover:underline" href="/admin/assistant/leads">Clear</Link>
        </form>
        <form action={changeLeadStatusAction} className="flex flex-wrap items-end gap-3" id="lead-bulk-form">
          <label className="text-sm font-semibold text-navy">Bulk status change<Select className="mt-1" name="status" required defaultValue=""><option disabled value="">Choose status</option>{leadStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</Select></label>
          <Button size="sm" type="submit" variant="secondary">Apply to selected</Button>
        </form>
        <p className="text-xs text-slate-500">Showing up to 100 matching leads. Select rows for bulk status changes.</p>
        {leads.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="px-2 py-3">Select</th><th className="px-2 py-3">Company / contact</th><th className="px-2 py-3">Email</th><th className="px-2 py-3">Location</th><th className="px-2 py-3">Status</th><th className="px-2 py-3">Last contacted</th><th className="px-2 py-3">Next follow-up</th><th className="px-2 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="px-2 py-3"><input aria-label={`Select ${lead.company}`} className="h-4 w-4 accent-royal" form="lead-bulk-form" name="leadIds" type="checkbox" value={lead.id} /></td>
                    <td className="px-2 py-3"><p className="font-semibold text-navy">{lead.company}</p><p className="text-xs text-slate-500">{lead.contactName ?? "No contact"}{lead.designation ? ` · ${lead.designation}` : ""}</p></td>
                    <td className="px-2 py-3"><a className="text-royal hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a></td>
                    <td className="px-2 py-3">{[lead.city, lead.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-2 py-3"><Badge tone={lead.doNotContact ? "danger" : "neutral"}>{lead.status.replaceAll("_", " ")}</Badge></td>
                    <td className="px-2 py-3">{lead.lastContactedAt ? formatDateTime(lead.lastContactedAt) : "—"}</td>
                    <td className="px-2 py-3">{lead.nextFollowupAt ? formatDateTime(lead.nextFollowupAt) : "—"}</td>
                    <td className="px-2 py-3"><div className="flex gap-3"><Link className="font-semibold text-royal hover:underline" href={`/admin/assistant/leads?edit=${lead.id}`}>Edit</Link><form action={deleteLeadAction}><input name="id" type="hidden" value={lead.id} /><Button size="sm" type="submit" variant="danger">Delete</Button></form></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No matching leads. Add a contact manually or import a CSV; no leads are collected automatically.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold text-navy">Suppression list</h2>
        <p className="text-sm text-slate-600">Suppressed addresses cannot receive outreach. Deleting a lead does not remove its suppression record.</p>
        {suppressions.length ? (
          <ul className="divide-y divide-slate-100">
            {suppressions.map((item) => <li className="flex flex-wrap justify-between gap-2 py-2 text-sm" key={item.id}><span className="font-medium text-navy">{item.email}</span><span className="text-slate-500">{item.reason} · {item.source}</span></li>)}
          </ul>
        ) : <p className="text-sm text-slate-500">No suppressed addresses.</p>}
      </Card>
    </div>
  );
}
