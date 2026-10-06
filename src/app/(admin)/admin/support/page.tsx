import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { markContactMessageHandledAction } from "@/lib/admin/contact-actions";
import { updateSupportRequestAction } from "@/lib/admin/support-actions";
import { db } from "@/lib/db";
import { companies, contactMessages, prioritySupportRequests, users } from "@/lib/db/schema";
import { formatIndianDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Priority support" };

export default async function AdminSupportPage() {
  const [rows, contacts] = await Promise.all([db.select({
    id: prioritySupportRequests.id,
    subject: prioritySupportRequests.subject,
    message: prioritySupportRequests.message,
    response: prioritySupportRequests.response,
    status: prioritySupportRequests.status,
    isPriority: prioritySupportRequests.isPriority,
    createdAt: prioritySupportRequests.createdAt,
    userName: users.fullName,
    userEmail: users.email,
    companyName: companies.name,
  })
    .from(prioritySupportRequests)
    .innerJoin(users, eq(users.id, prioritySupportRequests.userId))
    .leftJoin(companies, eq(companies.id, prioritySupportRequests.companyId))
    .orderBy(desc(prioritySupportRequests.isPriority), desc(prioritySupportRequests.createdAt))
    .limit(200),
    db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(200),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Support inbox" description="Review enterprise requests and public contact messages." />
      <h2 className="text-xl font-bold text-navy">Contact messages</h2>
      {contacts.map((contact) => (
        <Card key={contact.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-navy">{contact.subject || "Contact form message"}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {contact.name} · <a className="text-royal hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a>
                {contact.phone ? ` · ${contact.phone}` : ""} · {formatIndianDateTime(contact.createdAt)}
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{contact.handled ? "Handled" : "Needs reply"}</span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{contact.message}</p>
          <form action={markContactMessageHandledAction} className="mt-4">
            <input name="id" type="hidden" value={contact.id} />
            <input name="handled" type="hidden" value={contact.handled ? "false" : "true"} />
            <button className="text-sm font-semibold text-royal hover:underline" type="submit">
              Mark {contact.handled ? "unhandled" : "handled"}
            </button>
          </form>
        </Card>
      ))}
      <h2 className="mt-8 text-xl font-bold text-navy">Priority support</h2>
      {rows.map((row) => (
        <Card key={row.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-bold text-navy">{row.subject}{row.isPriority ? " · Priority" : ""}</h2>
            <span className="text-xs font-semibold text-slate-500">{row.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{row.userName} ({row.userEmail}){row.companyName ? ` · ${row.companyName}` : ""} · {formatIndianDateTime(row.createdAt)}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{row.message}</p>
          <form action={updateSupportRequestAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
            <input name="id" type="hidden" value={row.id} />
            <label className="text-sm font-medium text-navy">
              Status
              <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" defaultValue={row.status} name="status">
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="text-sm font-medium text-navy md:col-span-2">
              Admin response
              <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={row.response ?? ""} maxLength={5000} name="response" rows={3} />
            </label>
            <button className="justify-self-start rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">Save response</button>
          </form>
        </Card>
      ))}
    </div>
  );
}
