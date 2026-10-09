import Link from "next/link";
import { count, desc } from "drizzle-orm";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { CopyButton } from "@/components/admin/assistant/copy-button";
import { updateContactFormItemAction } from "@/lib/assistant/target-actions";
import { contactFormQueue, type ContactFormQueueStatus } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<ContactFormQueueStatus, string> = {
  pending: "Pending",
  done: "Done",
  skipped: "Skipped",
};

function statusBadge(status: ContactFormQueueStatus) {
  switch (status) {
    case "pending":
      return <Badge tone="warning">{STATUS_LABELS.pending}</Badge>;
    case "done":
      return <Badge tone="success">{STATUS_LABELS.done}</Badge>;
    case "skipped":
      return <Badge tone="neutral">{STATUS_LABELS.skipped}</Badge>;
  }
}

export default async function AssistantContactFormsPage() {
  const [items, statusCounts, totalRow] = await Promise.all([
    db.select()
      .from(contactFormQueue)
      .orderBy(desc(contactFormQueue.createdAt))
      .limit(200),
    db.select({ status: contactFormQueue.status, total: count() })
      .from(contactFormQueue)
      .groupBy(contactFormQueue.status),
    db.select({ total: count() }).from(contactFormQueue),
  ]);
  const counts = new Map(statusCounts.map((row) => [row.status, Number(row.total)]));
  const total = Number(totalRow[0]?.total ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact forms"
        description="Manual queue of contact forms detected on crawl targets. Open and submit each form by hand - the assistant never submits forms automatically."
      />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-royal hover:underline" href="/admin/assistant">Inbox</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/leads">Company leads</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/campaigns">Campaigns</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/targets">Crawl targets</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/settings">Settings and FAQ</Link>
      </nav>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">All items</p>
          <p className="font-bold text-navy">{total}</p>
        </div>
        {(["pending", "done", "skipped"] as const).map((status) => (
          <div key={status}>
            <p className="text-xs text-slate-500">{STATUS_LABELS[status]}</p>
            <p className="font-bold text-navy">{counts.get(status) ?? 0}</p>
          </div>
        ))}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-navy">Queue</h2>
        {items.length === 0 ? (
          <Alert tone="info">No contact forms in the queue. Crawl targets with contact forms to populate this queue.</Alert>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[70rem] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Form URL</th>
                  <th className="px-3 py-2">Prepared message</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-semibold text-navy">{item.companyName}</td>
                    <td className="px-3 py-2">
                      <a className="text-royal hover:underline" href={item.formUrl} rel="noopener" target="_blank">
                        Open form
                      </a>
                    </td>
                    <td className="max-w-xs px-3 py-2 text-slate-500">
                      <span className="line-clamp-3 whitespace-pre-wrap">{item.preparedMessage}</span>
                    </td>
                    <td className="px-3 py-2">{statusBadge(item.status)}</td>
                    <td className="px-3 py-2 text-slate-500">{formatDateTime(item.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CopyButton text={item.preparedMessage} label="Copy message" />
                        <form action={updateContactFormItemAction}>
                          <input name="id" type="hidden" value={item.id} />
                          <input name="status" type="hidden" value="done" />
                          <input name="notes" type="hidden" value="" />
                          <Button size="sm" type="submit" variant="secondary">Mark done</Button>
                        </form>
                        <form action={updateContactFormItemAction}>
                          <input name="id" type="hidden" value={item.id} />
                          <input name="status" type="hidden" value="skipped" />
                          <input name="notes" type="hidden" value="" />
                          <Button size="sm" type="submit" variant="ghost">Skip</Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
