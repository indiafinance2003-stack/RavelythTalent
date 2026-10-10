import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, isNotNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  chatConversations,
  chatReports,
  companies,
  jobs,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema/auth";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat reports",
};

export default async function ChatReportsPage() {
  await requireAdmin();

  const rows = await db
    .select({
      conversationId: chatReports.conversationId,
      reason: chatReports.reason,
      status: chatReports.status,
      createdAt: chatReports.createdAt,
      jobTitle: jobs.title,
      companyName: companies.name,
      candidateName: users.fullName,
    })
    .from(chatReports)
    .innerJoin(
      chatConversations,
      eq(chatConversations.id, chatReports.conversationId),
    )
    .leftJoin(jobs, eq(jobs.id, chatConversations.jobId))
    .leftJoin(companies, eq(companies.id, chatConversations.companyId))
    .leftJoin(users, eq(users.id, chatConversations.candidateUserId))
    .where(isNotNull(chatReports.conversationId))
    .orderBy(desc(chatReports.createdAt));

  const grouped = new Map<
    string,
    {
      conversationId: string;
      count: number;
      open: number;
      reasons: Set<string>;
      latest: Date;
      jobTitle: string | null;
      companyName: string | null;
      candidateName: string | null;
    }
  >();
  for (const row of rows) {
    if (!row.conversationId) continue;
    const entry = grouped.get(row.conversationId) ?? {
      conversationId: row.conversationId,
      count: 0,
      open: 0,
      reasons: new Set<string>(),
      latest: row.createdAt,
      jobTitle: row.jobTitle,
      companyName: row.companyName,
      candidateName: row.candidateName,
    };
    entry.count += 1;
    if (row.status === "open") entry.open += 1;
    entry.reasons.add(row.reason);
    if (row.createdAt > entry.latest) entry.latest = row.createdAt;
    grouped.set(row.conversationId, entry);
  }
  const conversations = [...grouped.values()].sort(
    (a, b) => b.latest.getTime() - a.latest.getTime(),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat reports"
        description="Reported conversations. Individual chats are only reviewed when reported."
      />
      <Card>
        {conversations.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="Reports from candidates and employers appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {conversations.map((conversation) => (
              <li
                key={conversation.conversationId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">
                    {conversation.candidateName ?? "Candidate"} ·{" "}
                    {conversation.companyName ?? "Company"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {conversation.jobTitle ?? "Job"} ·{" "}
                    {[...conversation.reasons].join(", ")} ·{" "}
                    {formatDateTime(conversation.latest)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={conversation.open > 0 ? "warning" : "success"}>
                    {conversation.open > 0
                      ? `${conversation.open} open`
                      : "reviewed"}
                  </Badge>
                  <Link
                    href={`/admin/chat-reports/${conversation.conversationId}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal"
                  >
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
