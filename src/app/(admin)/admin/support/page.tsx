import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { updateSupportRequestAction } from "@/lib/admin/support-actions";
import { db } from "@/lib/db";
import { companies, prioritySupportRequests, users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Priority support" };

export default async function AdminSupportPage() {
  const rows = await db.select({
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
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Priority support" description="Review enterprise support requests, prioritized first." />
      {rows.map((row) => (
        <Card key={row.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-bold text-navy">{row.subject}{row.isPriority ? " · Priority" : ""}</h2>
            <span className="text-xs font-semibold text-slate-500">{row.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{row.userName} ({row.userEmail}){row.companyName ? ` · ${row.companyName}` : ""} · {row.createdAt.toLocaleString("en-IN")}</p>
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
