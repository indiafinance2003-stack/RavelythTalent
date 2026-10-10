import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  auditLogs,
  chatConversations,
  chatMessages,
  chatReports,
  companies,
  jobs,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema/auth";
import { resolveConversationReportsAction } from "@/lib/chat/admin-actions";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = {
  title: "Reported conversation",
};

export default async function ChatReportDetailPage({
  params,
}: {
  params: Params;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const conversation = (
    await db
      .select({
        id: chatConversations.id,
        jobTitle: jobs.title,
        companyName: companies.name,
        candidateName: users.fullName,
        createdAt: chatConversations.createdAt,
      })
      .from(chatConversations)
      .leftJoin(jobs, eq(jobs.id, chatConversations.jobId))
      .leftJoin(companies, eq(companies.id, chatConversations.companyId))
      .leftJoin(users, eq(users.id, chatConversations.candidateUserId))
      .where(eq(chatConversations.id, id))
      .limit(1)
  ).at(0);
  if (!conversation) notFound();

  const [messages, reports] = await Promise.all([
    db
      .select({
        id: chatMessages.id,
        senderSide: chatMessages.senderSide,
        body: chatMessages.body,
        flagged: chatMessages.flagged,
        createdAt: chatMessages.createdAt,
        senderName: users.fullName,
      })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.senderUserId))
      .where(eq(chatMessages.conversationId, id))
      .orderBy(asc(chatMessages.createdAt)),
    db
      .select({
        id: chatReports.id,
        reason: chatReports.reason,
        details: chatReports.details,
        status: chatReports.status,
        createdAt: chatReports.createdAt,
      })
      .from(chatReports)
      .where(eq(chatReports.conversationId, id))
      .orderBy(desc(chatReports.createdAt)),
  ]);

  // Reading a reported conversation is itself an audited action.
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "chat_report.view",
    entityType: "chat_conversation",
    entityId: id,
    description: "Viewed a reported chat conversation.",
    metadata: { reportCount: reports.length },
  });

  const anyOpen = reports.some((report) => report.status === "open");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reported conversation"
        description={`${conversation.candidateName ?? "Candidate"} · ${
          conversation.companyName ?? "Company"
        } · ${conversation.jobTitle ?? "Job"}`}
        action={
          <Link
            href="/admin/chat-reports"
            className="text-sm font-semibold text-royal hover:underline"
          >
            Back to reports
          </Link>
        }
      />

      <Alert tone="info" title="Privacy">
        Conversations are only reviewed when reported. This review was recorded
        in the audit log.
      </Alert>

      <Card>
        <h2 className="text-sm font-bold text-navy">Messages</h2>
        <ul className="mt-3 space-y-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className="rounded-xl border border-slate-200 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-navy">
                  {message.senderName ?? message.senderSide}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDateTime(message.createdAt)}
                  {message.flagged ? " · flagged" : ""}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">
                {message.body}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-navy">
            Reports ({reports.length})
          </h2>
          {anyOpen ? (
            <div className="flex gap-2">
              <form action={resolveConversationReportsAction}>
                <input type="hidden" name="conversationId" value={id} />
                <input type="hidden" name="status" value="reviewed" />
                <Button type="submit" size="sm" variant="secondary">
                  Mark reviewed
                </Button>
              </form>
              <form action={resolveConversationReportsAction}>
                <input type="hidden" name="conversationId" value={id} />
                <input type="hidden" name="status" value="resolved" />
                <Button type="submit" size="sm">
                  Resolve
                </Button>
              </form>
            </div>
          ) : (
            <Badge tone="success">Reviewed</Badge>
          )}
        </div>
        <ul className="mt-3 space-y-2">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-xl border border-slate-200 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold capitalize text-navy">
                  {report.reason}
                </span>
                <Badge tone={report.status === "open" ? "warning" : "success"}>
                  {report.status}
                </Badge>
              </div>
              {report.details ? (
                <p className="mt-1 text-slate-600">{report.details}</p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                {formatDateTime(report.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
