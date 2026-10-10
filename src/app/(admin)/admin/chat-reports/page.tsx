import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { chatReports, chatConversations, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat reports",
};

export default async function ChatReportsPage() {
  await requireAdmin();

  const reports = await db
    .select({
      id: chatReports.id,
      reason: chatReports.reason,
      status: chatReports.status,
      details: chatReports.details,
      conversationId: chatReports.conversationId,
      messageId: chatReports.messageId,
      reporterEmail: users.email,
      createdAt: chatReports.createdAt,
    })
    .from(chatReports)
    .leftJoin(users, eq(users.id, chatReports.reporterUserId))
    .orderBy(desc(chatReports.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Chat reports" description="Reported chat content" />
      <Card>
        {reports.length === 0 ? (
          <p className="text-sm text-slate-600">No reports yet.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{r.reason}</span>
                  <Badge>{r.status}</Badge>
                </div>
                {r.details && <p className="mt-2 text-sm">{r.details}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  Reported by {r.reporterEmail} at {r.createdAt.toISOString()}
                </p>
                {(r.conversationId || r.messageId) && (
                  <p className="text-xs text-slate-500">
                    {r.conversationId && `Conv: ${r.conversationId}`} {r.messageId && `Msg: ${r.messageId}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}