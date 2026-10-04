import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { fromAddress, getTransport } from "./smtp";

/**
 * Email outbox.
 *
 * Every message is persisted BEFORE any SMTP call so that a slow or broken
 * mail server can never fail a user-facing request. A cron job
 * (/api/internal/cron/process-email-outbox, every minute) drains the queue with
 * exponential backoff.
 */

export type EnqueueAttachment = {
  filename: string;
  contentType: string;
  /** Absolute local path on disk (kept outside /public). */
  path?: string;
  /** Inline base64 payload, used for small attachments. */
  contentBase64?: string;
};

export type EnqueueInput = {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  templateKey?: string | null;
  metadata?: Record<string, unknown>;
  attachments?: EnqueueAttachment[];
};

export async function enqueueEmail(input: EnqueueInput): Promise<number> {
  const rows = await db
    .insert(emailOutbox)
    .values({
      toEmail: input.to.trim().toLowerCase(),
      toName: input.toName ?? null,
      subject: input.subject,
      html: input.html,
      text: input.text ?? null,
      templateKey: input.templateKey ?? null,
      metadata: input.metadata ?? {},
      attachments: input.attachments ?? [],
      status: "queued",
    })
    .returning({ id: emailOutbox.id });
  return rows[0]!.id;
}

type OutboxRow = typeof emailOutbox.$inferSelect;

function backoffMs(attempts: number): number {
  const raw = 2 ** attempts * 60_000; // 1m, 2m, 4m, 8m ...
  return Math.min(raw, 6 * 60 * 60 * 1000); // cap at 6 hours
}

async function deliver(row: OutboxRow): Promise<void> {
  const attachments = (row.attachments ?? []).map((a) =>
    a.contentBase64
      ? {
          filename: a.filename,
          content: Buffer.from(a.contentBase64, "base64"),
          contentType: a.contentType,
        }
      : { filename: a.filename, path: a.path!, contentType: a.contentType },
  );

  const info = await getTransport().sendMail({
    from: fromAddress(),
    to: row.toName ? { address: row.toEmail, name: row.toName } : row.toEmail,
    subject: row.subject,
    html: row.html,
    text: row.text ?? undefined,
    attachments,
    messageId: undefined,
    headers: { "X-Entity-Ref-ID": `ravelyth-outbox-${row.id}` },
  });

  await db
    .update(emailOutbox)
    .set({
      status: "sent",
      attempts: row.attempts + 1,
      sentAt: new Date(),
      messageId: info.messageId ?? null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(emailOutbox.id, row.id));
}

async function markFailure(row: OutboxRow, error: unknown): Promise<void> {
  const attempts = row.attempts + 1;
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = attempts >= row.maxAttempts;

  await db
    .update(emailOutbox)
    .set({
      status: exhausted ? "failed" : "queued",
      attempts,
      lastError: message.slice(0, 2000),
      nextAttemptAt: exhausted
        ? row.nextAttemptAt
        : new Date(Date.now() + backoffMs(attempts)),
      updatedAt: new Date(),
    })
    .where(eq(emailOutbox.id, row.id));
}

export type OutboxRunResult = {
  picked: number;
  sent: number;
  failed: number;
};

/** Drains up to `limit` due messages. Safe to call on every cron tick. */
export async function processEmailOutbox(
  limit = 25,
): Promise<OutboxRunResult> {
  const rows = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        inArray(emailOutbox.status, ["queued", "failed"]),
        lte(emailOutbox.nextAttemptAt, new Date()),
      ),
    )
    .orderBy(asc(emailOutbox.nextAttemptAt), asc(emailOutbox.id))
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await deliver(row);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`[email] delivery failed for #${row.id}:`, error);
      await markFailure(row, error);
    }
  }

  return { picked: rows.length, sent, failed };
}

/** Admin "retry" action for a failed message. */
export async function retryOutboxEmail(id: number): Promise<void> {
  await db
    .update(emailOutbox)
    .set({
      status: "queued",
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(emailOutbox.id, id));
}