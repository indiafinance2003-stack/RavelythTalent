import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Textarea } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import {
  assistantSettings,
  inboxDrafts,
  inboxMessages,
  inboxClassifications,
  inboxThreads,
} from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/utils";
import { z } from "zod";
import { getMailAccountStatuses } from "@/lib/assistant/mail-accounts";
import {
  saveInboxDraftAction,
  sendInboxReplyAction,
  updateInboxThreadAction,
} from "@/lib/assistant/actions";
import {
  classifyThreadWithAiAction,
  draftReplyWithAiAction,
} from "@/lib/assistant/ai-actions";
import { loadAssistantOverview } from "@/lib/assistant/overview";
import { OverviewTally } from "@/components/admin/assistant/overview-tally";

export const dynamic = "force-dynamic";

type SearchParams = {
  thread?: string;
  account?: string;
  status?: string;
  category?: string;
  attention?: string;
};

const categories = [
  "payment",
  "account",
  "job_report",
  "complaint",
  "opt_out",
  "bounce",
  "out_of_office",
  "general",
];

export default async function AssistantInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const validAccount = params.account === "support" || params.account === "gmail"
    ? params.account
    : undefined;
  const validStatus = params.status === "open" || params.status === "handled"
    ? params.status
    : undefined;
  const validCategory = categories.includes(params.category ?? "")
    ? params.category
    : undefined;

  const filters = [];
  if (validAccount) filters.push(eq(inboxThreads.accountId, validAccount));
  if (validStatus) filters.push(eq(inboxThreads.status, validStatus));
  if (validCategory) filters.push(eq(inboxThreads.category, validCategory));
  if (params.attention === "true") filters.push(eq(inboxThreads.needsAttention, true));
  if (params.attention === "false") filters.push(eq(inboxThreads.needsAttention, false));

  const [threads, accountStatuses, settings] = await Promise.all([
    db.select().from(inboxThreads)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(inboxThreads.lastMessageAt))
      .limit(100),
    Promise.resolve(getMailAccountStatuses()),
    db.select().from(assistantSettings)
      .where(eq(assistantSettings.id, 1))
      .limit(1),
  ]);
  const overview = await loadAssistantOverview();

  const selectedId = z.uuid().safeParse(params.thread).success ? params.thread : undefined;
  const [selected] = selectedId
    ? await db.select().from(inboxThreads)
      .where(eq(inboxThreads.id, selectedId))
      .limit(1)
    : [];
  const selectedMessages = selected
    ? await db.select().from(inboxMessages)
      .where(eq(inboxMessages.threadId, selected.id))
      .orderBy(inboxMessages.createdAt)
    : [];
  const [draft] = selected
    ? await db.select().from(inboxDrafts)
      .where(and(eq(inboxDrafts.threadId, selected.id), isNull(inboxDrafts.sentAt)))
      .orderBy(desc(inboxDrafts.updatedAt))
      .limit(1)
    : [];
  const [latestAiClassification] = selected
    ? await db.select().from(inboxClassifications)
      .where(and(
        eq(inboxClassifications.threadId, selected.id),
        eq(inboxClassifications.source, "ai"),
      ))
      .orderBy(desc(inboxClassifications.createdAt))
      .limit(1)
    : [];

  const env = getEnv();
  const aiEnabled = Boolean(settings[0]?.aiEnabled && env.ANTHROPIC_API_KEY);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistant"
        description="Review support inbox messages, manage replies, and track attention items."
      />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-royal hover:underline" href="/admin/assistant">Inbox</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/leads">Company leads</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/campaigns">Campaigns</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/targets">Targets</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/contact-forms">Contact forms</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/settings">Settings and FAQ</Link>
      </nav>

      <OverviewTally summary={overview} />

      <div className="grid gap-3 sm:grid-cols-2">
        {accountStatuses.map((account) => (
          <Card key={account.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-semibold capitalize text-navy">{account.id} inbox</p>
              <p className="text-sm text-slate-600">{account.address ?? "Not configured"}</p>
            </div>
            <Badge tone={account.configured ? "success" : "neutral"}>
              {account.configured ? "Connected by environment" : "Not configured"}
            </Badge>
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-semibold text-navy">AI assistance</p>
          <p className="text-sm text-slate-600">
            {aiEnabled ? "Enabled in settings" : "AI not configured — add an API key and enable it in settings."}
          </p>
        </div>
        <Link className="text-sm font-semibold text-royal hover:underline" href="/admin/assistant/settings">
          Assistant settings
        </Link>
      </Card>

      <Card className="p-4">
        <form action="/admin/assistant" className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm font-medium text-slate-700">
            Account
            <select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" name="account" defaultValue={validAccount ?? ""}>
              <option value="">All accounts</option>
              <option value="support">Support</option>
              <option value="gmail">Gmail</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Thread status
            <select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" name="status" defaultValue={validStatus ?? ""}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="handled">Handled</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Category
            <select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" name="category" defaultValue={validCategory ?? ""}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Attention
            <select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" name="attention" defaultValue={params.attention ?? ""}>
              <option value="">All</option>
              <option value="true">Needs attention</option>
              <option value="false">No flag</option>
            </select>
          </label>
          <Button size="sm" type="submit">Filter</Button>
          <Link className="text-sm font-semibold text-royal hover:underline" href="/admin/assistant">Clear</Link>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.5fr)]">
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold text-navy">Inbox threads</h2>
          {threads.length ? (
            <ul className="divide-y divide-slate-100">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    className={`block rounded-xl p-3 hover:bg-sky-tint/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal ${selected?.id === thread.id ? "bg-sky-tint/70" : ""}`}
                    href={`/admin/assistant?thread=${thread.id}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-navy">{thread.subject}</span>
                      {thread.needsAttention ? <Badge tone="warning">Needs attention</Badge> : null}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {thread.accountId} · {thread.category ?? "unclassified"} · {thread.status}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {thread.lastMessageAt ? formatDateTime(thread.lastMessageAt) : "No messages"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No inbox threads" description="Configure an inbox account or wait for its next sync." />
          )}
        </Card>

        <Card className="space-y-5 p-4 sm:p-6">
          {selected ? (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-navy">{selected.subject}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selected.accountId} · {selected.category ?? "unclassified"} · {selected.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiEnabled ? (
                    <>
                      <form action={classifyThreadWithAiAction}>
                        <input name="threadId" type="hidden" value={selected.id} />
                        <Button size="sm" type="submit" variant="secondary">Classify with AI</Button>
                      </form>
                      <form action={draftReplyWithAiAction}>
                        <input name="threadId" type="hidden" value={selected.id} />
                        <Button size="sm" type="submit" variant="secondary">Draft reply with AI</Button>
                      </form>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">AI not configured — add an API key to enable AI buttons.</p>
                  )}
                  <form action={updateInboxThreadAction}>
                    <input name="threadId" type="hidden" value={selected.id} />
                    <input name="status" type="hidden" value={selected.status === "handled" ? "open" : "handled"} />
                    <Button size="sm" variant="secondary" type="submit">
                      {selected.status === "handled" ? "Reopen" : "Mark handled"}
                    </Button>
                  </form>
                  <form action={updateInboxThreadAction}>
                    <input name="threadId" type="hidden" value={selected.id} />
                    <input name="needsAttention" type="hidden" value={String(!selected.needsAttention)} />
                    <Button size="sm" variant="secondary" type="submit">
                      {selected.needsAttention ? "Clear attention" : "Needs my attention"}
                    </Button>
                  </form>
                </div>
              </header>

              {latestAiClassification ? (
                <Alert
                  className="space-y-1"
                  tone={latestAiClassification.needsHuman ? "warning" : "info"}
                  title={`AI classification · ${latestAiClassification.category} · ${latestAiClassification.urgency ?? "normal"} urgency`}
                >
                  <p>{latestAiClassification.summary}</p>
                  <p>Suggested status: {latestAiClassification.suggestedStatus ?? "none"} · Confidence: {latestAiClassification.confidence ?? 0}%</p>
                  <p>Suggestions are not applied automatically.</p>
                </Alert>
              ) : null}

              <div className="space-y-3">
                {selectedMessages.map((message) => (
                  <article className="rounded-xl border border-slate-200 bg-white p-4" key={message.id}>
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                      <span>{message.direction === "inbound" ? "From" : "Sent"}: {message.fromAddress}</span>
                      <time>{message.sentAt ? formatDateTime(message.sentAt) : formatDateTime(message.createdAt)}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                      {message.textBody || "(No plain-text body was available.)"}
                    </p>
                    {message.attachmentNames.length ? (
                      <p className="mt-3 text-xs text-slate-500">
                        Attachments: {message.attachmentNames.join(", ")}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>

              {draft?.sendStatus === "sending" ? (
                <Alert tone="warning" title="Verify delivery before retrying">
                  A send attempt has an uncertain result. Check the sender mailbox for this reply before creating another draft; retrying may send a duplicate.
                </Alert>
              ) : (
                <form action={saveInboxDraftAction} className="space-y-3">
                  <input name="threadId" type="hidden" value={selected.id} />
                  {draft ? <input name="draftId" type="hidden" value={draft.id} /> : null}
                  <label className="block text-sm font-semibold text-navy" htmlFor="reply-body">
                    Reply draft
                  </label>
                  <Textarea
                    id="reply-body"
                    name="body"
                    defaultValue={draft?.body ?? ""}
                    maxLength={20_000}
                    placeholder="Write a plain-text reply..."
                    required
                    rows={6}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" variant="secondary">Save draft</Button>
                    {draft ? (
                      <Button formAction={sendInboxReplyAction} name="draftId" value={draft.id} type="submit">
                        Approve and send from {selected.accountId}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">
                    Replies are plain text and always require an explicit admin send action.
                  </p>
                </form>
              )}
            </>
          ) : (
            <EmptyState title="Select a thread" description="Choose a conversation to review its plain-text messages and reply draft." />
          )}
        </Card>
      </div>
    </div>
  );
}
