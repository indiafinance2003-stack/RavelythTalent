import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { retryFailedEmailAction, sendTestEmailAction } from "@/lib/admin/email-actions";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { formatIndianDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Email outbox" };

export default async function AdminEmailsPage() {
  const messages = await db
    .select()
    .from(emailOutbox)
    .orderBy(desc(emailOutbox.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Email outbox" description="Delivery history, suppressed requests, failure details and retry controls." />
      <Card>
        <h2 className="mb-3 text-base font-bold text-navy">Send test email</h2>
        <form action={sendTestEmailAction} className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-sm font-medium text-navy">
            Recipient
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="email" required type="email" />
          </label>
          <button className="rounded-lg bg-royal px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy" type="submit">Queue test email</button>
        </form>
      </Card>
      {messages.map((message) => (
        <Card key={message.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-navy">{message.subject}</h2>
              <p className="mt-1 text-sm text-slate-600">{message.toEmail}{message.toName ? ` · ${message.toName}` : ""}</p>
              <p className="mt-1 text-xs text-slate-500">
                {message.templateKey ?? "custom"} · {message.status} · {message.attempts}/{message.maxAttempts} attempts · {formatIndianDateTime(message.createdAt)}
              </p>
              {message.lastError ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-rose-700">
                  {message.status === "suppressed" ? "Suppression reason: " : "Error: "}{message.lastError}
                </p>
              ) : null}
            </div>
            {message.status === "failed" ? (
              <form action={retryFailedEmailAction}>
                <input name="id" type="hidden" value={message.id} />
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-navy hover:border-royal" type="submit">Retry</button>
              </form>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
