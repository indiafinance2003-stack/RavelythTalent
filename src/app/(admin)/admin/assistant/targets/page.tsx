import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { Alert, Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui/primitives";
import { TargetsCsvImport } from "@/components/admin/assistant/targets-csv-import";
import {
  addManualTargetEmailAction,
  approveTargetEmailsAction,
  crawlSelectedTargetsAction,
  deleteTargetAction,
  queueContactFormAction,
  rejectTargetAction,
  saveTargetAction,
} from "@/lib/assistant/target-actions";
import { companyTargets, targetEmails, type CompanyTargetStatus } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; status?: string };

const STATUS_VALUES = [
  "new",
  "crawling",
  "crawled",
  "emails_found",
  "contact_form_only",
  "no_contact_found",
  "approved",
  "rejected",
  "converted",
] as const satisfies readonly CompanyTargetStatus[];

function statusBadge(status: CompanyTargetStatus) {
  switch (status) {
    case "crawled":
      return <Badge tone="teal">Crawled</Badge>;
    case "converted":
      return <Badge tone="brand">Converted</Badge>;
    case "approved":
      return <Badge tone="brand">Approved</Badge>;
    case "emails_found":
      return <Badge tone="success">Emails found</Badge>;
    case "contact_form_only":
      return <Badge tone="warning">Contact form only</Badge>;
    case "crawling":
      return <Badge tone="warning">Crawling</Badge>;
    case "no_contact_found":
      return <Badge tone="navy">No contact found</Badge>;
    case "rejected":
      return <Badge tone="danger">Rejected</Badge>;
    case "new":
    default:
      return <Badge tone="neutral">New</Badge>;
  }
}

const kindTone = { hr: "success", generic: "brand", other: "neutral" } as const;

export default async function AssistantTargetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const status = STATUS_VALUES.includes(params.status as CompanyTargetStatus)
    ? (params.status as CompanyTargetStatus)
    : undefined;

  const filters = [];
  if (status) filters.push(eq(companyTargets.status, status));
  if (params.q) {
    const term = `%${params.q.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
    filters.push(or(
      ilike(companyTargets.companyName, term),
      ilike(companyTargets.domain, term),
      ilike(companyTargets.websiteUrl, term),
    ));
  }

  const [targets, statusCounts, totalRow] = await Promise.all([
    db.select()
      .from(companyTargets)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(companyTargets.createdAt))
      .limit(100),
    db.select({ status: companyTargets.status, total: count() })
      .from(companyTargets)
      .groupBy(companyTargets.status),
    db.select({ total: count() }).from(companyTargets),
  ]);

  const ids = targets.map((target) => target.id);
  const emails = ids.length
    ? await db.select({
      id: targetEmails.id,
      targetId: targetEmails.targetId,
      email: targetEmails.email,
      kind: targetEmails.kind,
      sourceUrl: targetEmails.sourceUrl,
      mxOk: targetEmails.mxOk,
    }).from(targetEmails).where(inArray(targetEmails.targetId, ids))
    : [];
  const emailsByTarget = new Map<string, typeof emails>();
  for (const email of emails) {
    const list = emailsByTarget.get(email.targetId) ?? [];
    list.push(email);
    emailsByTarget.set(email.targetId, list);
  }

  const counts = new Map(statusCounts.map((row) => [row.status, Number(row.total)]));
  const total = Number(totalRow[0]?.total ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crawl targets"
        description="Add websites the assistant should crawl for public contact emails and contact forms. Domains are unique; the crawler never submits forms, it only records their URL for manual outreach."
        action={
          <Link className="text-sm font-semibold text-royal hover:underline" href="/api/admin/assistant/targets/export">
            Export CSV
          </Link>
        }
      />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-royal hover:underline" href="/admin/assistant">Inbox</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/leads">Company leads</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/campaigns">Campaigns</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/contact-forms">Contact forms</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/settings">Settings and FAQ</Link>
      </nav>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <p className="text-xs text-slate-500">All targets</p>
          <p className="font-bold text-navy">{total}</p>
        </div>
        {STATUS_VALUES.map((value) => (
          <div key={value}>
            <p className="text-xs text-slate-500">{value.replaceAll("_", " ")}</p>
            <p className="font-bold text-navy">{counts.get(value) ?? 0}</p>
          </div>
        ))}
      </Card>

      <Card className="grid gap-4 sm:grid-cols-3">
        <form action={crawlSelectedTargetsAction} className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Crawl selected now</h2>
          <p className="text-sm text-slate-600">Runs immediately, even when the scheduled crawl is off.</p>
          <Select className="min-h-32" multiple name="targetIds">
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.companyName} ({target.domain})
              </option>
            ))}
          </Select>
          <Button type="submit">Crawl selected</Button>
        </form>
        <TargetsCsvImport />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-navy">Add a crawl target</h2>
        <form action={saveTargetAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Company name *
            <Input className="mt-1" maxLength={200} name="companyName" required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Website *
            <Input className="mt-1" maxLength={500} name="website" placeholder="https://example.in" required type="url" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            City
            <Input className="mt-1" maxLength={120} name="city" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            State
            <Input className="mt-1" maxLength={120} name="state" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Industry
            <Input className="mt-1" maxLength={160} name="industry" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Source
            <Input className="mt-1" maxLength={120} name="source" />
          </label>
          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit">Add target</Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-navy">Review targets</h2>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="text-sm font-medium text-slate-700">
              Search
              <Input className="mt-1" defaultValue={params.q ?? ""} name="q" placeholder="Company or domain" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Status
              <Select className="mt-1" defaultValue={status ?? ""} name="status">
                <option value="">All statuses</option>
                {STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary">Filter</Button>
          </form>
        </div>

        {targets.length === 0 ? (
          <Alert tone="info">No crawl targets match. Add a domain above to start crawling.</Alert>
        ) : (
          <div className="space-y-4">
            {targets.map((target) => {
              const found = emailsByTarget.get(target.id) ?? [];
              return (
                <div key={target.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-navy">{target.companyName}</h3>
                      <p className="text-sm text-slate-500">
                        <a className="text-royal hover:underline" href={target.websiteUrl} rel="noopener" target="_blank">
                          {target.websiteUrl}
                        </a>
                        {" · "}
                        <code>{target.domain}</code>
                        {target.city ? ` · ${target.city}` : ""}
                        {target.state ? `, ${target.state}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(target.status)}
                      <span className="text-xs text-slate-500">
                        {target.pagesCrawled} page(s)
                        {target.lastCrawledAt ? ` · ${formatDateTime(target.lastCrawledAt)}` : " · never crawled"}
                      </span>
                    </div>
                  </div>

                  {target.crawlError ? <Alert className="mt-3" tone="error">{target.crawlError}</Alert> : null}
                  {target.contactFormUrl ? (
                    <Alert className="mt-3" tone="info">
                      Contact form detected:{" "}
                      <a className="text-royal underline" href={target.contactFormUrl} rel="noopener" target="_blank">
                        {target.contactFormUrl}
                      </a>
                    </Alert>
                  ) : null}

                  {found.length ? (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[42rem] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Email</th>
                            <th className="px-3 py-2">Kind</th>
                            <th className="px-3 py-2">MX</th>
                            <th className="px-3 py-2">Source</th>
                            <th className="px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {found.map((email) => (
                            <tr key={email.id}>
                              <td className="px-3 py-2 font-medium text-navy">{email.email}</td>
                              <td className="px-3 py-2"><Badge tone={kindTone[email.kind]}>{email.kind}</Badge></td>
                              <td className="px-3 py-2">
                                {email.mxOk
                                  ? <Badge tone="success">MX ok</Badge>
                                  : <Badge tone="warning">No MX</Badge>}
                              </td>
                              <td className="px-3 py-2 text-slate-500">{email.sourceUrl ?? "manual"}</td>
                              <td className="px-3 py-2">
                                <form action={approveTargetEmailsAction}>
                                  <input name="targetId" type="hidden" value={target.id} />
                                  <input name="emailIds" type="hidden" value={email.id} />
                                  <Button size="sm" type="submit" variant="secondary">Approve as lead</Button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No emails recorded for this target yet.</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <form action={addManualTargetEmailAction} className="flex items-end gap-2">
                      <label className="text-sm font-medium text-slate-700">
                        Add email by hand
                        <Input className="mt-1" name="email" placeholder="hr@example.in" type="email" />
                      </label>
                      <input name="targetId" type="hidden" value={target.id} />
                      <Button size="sm" type="submit" variant="subtle">Add email</Button>
                    </form>
                    <form action={crawlSelectedTargetsAction}>
                      <input name="targetIds" type="hidden" value={target.id} />
                      <Button size="sm" type="submit" variant="secondary">Re-crawl</Button>
                    </form>
                    {target.contactFormUrl ? (
                      <form action={queueContactFormAction}>
                        <input name="targetId" type="hidden" value={target.id} />
                        <Button size="sm" type="submit" variant="secondary">Send to contact-form queue</Button>
                      </form>
                    ) : null}
                    <form action={rejectTargetAction}>
                      <input name="targetId" type="hidden" value={target.id} />
                      <Button size="sm" type="submit" variant="ghost">Reject</Button>
                    </form>
                    <form action={deleteTargetAction}>
                      <input name="id" type="hidden" value={target.id} />
                      <Button size="sm" type="submit" variant="danger">Delete</Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
