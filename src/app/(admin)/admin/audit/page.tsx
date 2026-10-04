import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Admin audit log" };

export default async function AdminAuditPage() {
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      description: auditLogs.description,
      actorName: users.fullName,
      actorEmail: users.email,
      createdAt: auditLogs.createdAt,
      ip: auditLogs.ip,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Recent administrative and platform actions." />
      {rows.map((row) => (
        <Card key={row.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-semibold text-navy">{row.action}</p>
            <time className="text-xs text-slate-500">{row.createdAt.toLocaleString("en-IN")}</time>
          </div>
          <p className="mt-1 text-sm text-slate-700">{row.description ?? `${row.entityType ?? "record"} ${row.entityId ?? ""}`}</p>
          <p className="mt-1 break-all text-xs text-slate-500">
            {row.actorName ?? "System"}{row.actorEmail ? ` (${row.actorEmail})` : ""}
            {row.entityType ? ` · ${row.entityType}: ${row.entityId ?? "—"}` : ""}
            {row.ip ? ` · ${row.ip}` : ""}
          </p>
          {row.metadata && Object.keys(row.metadata).length > 0 ? (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-offwhite p-2 text-xs text-slate-600">{JSON.stringify(row.metadata, null, 2)}</pre>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
