import 'server-only';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  jobCreditLedger,
  jobPackages,
  orders,
  type JobCreditLedgerRow,
  type JobPackageRow,
  type OrderRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import type { AppDatabase } from '@/lib/db';
import { rowsFromExecute } from '@/lib/db/rows';

/**
 * Job credits: an append-only ledger, never a mutable counter.
 *
 * Balance is always derived with `SUM(amount)` inside a transaction, so there
 * is no stored number to drift or to tamper with from the client.
 *
 * Race-safety (see §13): consumption is guarded by the unique index on
 * `job_credit_ledger.job_id`. Even if two requests for the same job race, only
 * one ledger row can ever exist for it, so a job can never consume two credits
 * and the losing transaction rolls back.
 *
 * Grants are likewise unique per `order_id`, so a replayed payment webhook
 * cannot credit an account twice.
 */

export interface CreditBalance {
  /** Sum of all positive ledger rows for the company. */
  total: number;
  /** Absolute value of consumed rows. */
  used: number;
  /** What the employer may still spend. */
  available: number;
  /** Expiry of the earliest outstanding grant, when one exists. */
  earliestExpiry: string | null;
}

/**
 * Reads rows out of a raw `db.execute()` result.
 *
 * Drivers differ: postgres-js resolves to the row array directly, while the
 * PGlite driver (used by the integration tests) resolves to `{ rows: [...] }`.
 * Normalising here keeps every service portable across both, and means the
 * production query is exercised verbatim by the tests.
 */
function rowsFrom<T>(result: unknown): T[] {
  return rowsFromExecute<T>(result);
}

/** Computes a company's credit balance directly from the ledger. */
export async function getCreditBalance(companyId: string): Promise<CreditBalance> {
  const { db } = dbFromRequest();
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::int AS total,
      COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0)::int AS used,
      COALESCE(SUM(amount), 0)::int AS available
    FROM job_credit_ledger
    WHERE company_id = ${companyId}
  `);

  const row = rowsFrom<{ total: number; used: number; available: number }>(result)[0];
  const total = row?.total ?? 0;
  const used = row?.used ?? 0;
  const available = row?.available ?? 0;

  // Earliest expiry among outstanding grants: the conservative bound to show.
  const expiryRows = await db
    .select({ expiresAt: jobCreditLedger.expiresAt })
    .from(jobCreditLedger)
    .where(
      and(
        eq(jobCreditLedger.companyId, companyId),
        eq(jobCreditLedger.reason, 'order'),
        gt(jobCreditLedger.expiresAt, new Date(0))
      )
    )
    .limit(1);

  return {
    total,
    used,
    available,
    earliestExpiry: expiryRows[0]?.expiresAt ? expiryRows[0].expiresAt!.toISOString() : null,
  };
}

/** Either the root database or an existing transaction, for composable helpers. */
type DbExecutor = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

/**
 * Grants credits for a paid order. Idempotent per order.
 *
 * Called ONLY from a verified payment path. Returns null when the order was
 * already credited, which is the correct outcome for a replayed webhook.
 *
 * The caller supplies the executor so this can join an EXISTING transaction
 * (payment confirmation + credit allocation must be one atomic unit). Opening a
 * second transaction here would deadlock on a single-connection pool.
 */
export async function grantCreditsWith(
  tx: DbExecutor,
  orderId: string,
  actorUserId: string | null = null
): Promise<JobCreditLedgerRow | null> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested order was not found.', 404);
  }

  // Only a paid order grants credits. A browser claim is never consulted.
  if (order.status !== 'paid') {
    throw new AppError(
      AppErrorCode.CONFLICT,
      'Credits are granted only after a payment has been verified.',
      409
    );
  }

  const [pkg] = await tx
    .select()
    .from(jobPackages)
    .where(eq(jobPackages.id, order.packageId))
    .limit(1);
  if (!pkg) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested package was not found.', 404);
  }

  // Already granted? Returning null keeps callers quiet on a replay; the unique
  // index on order_id remains the hard backstop.
  const [existing] = await tx
    .select({ id: jobCreditLedger.id })
    .from(jobCreditLedger)
    .where(eq(jobCreditLedger.orderId, orderId))
    .limit(1);
  if (existing) return null;

  const expiresAt = new Date(Date.now() + Math.max(1, pkg.validityDays) * 24 * 60 * 60 * 1000);

  const [row] = await tx
    .insert(jobCreditLedger)
    .values({
      companyId: order.companyId,
      amount: pkg.credits,
      reason: 'order',
      orderId,
      expiresAt,
      notes: `Credits from ${pkg.name}`,
      createdByUserId: actorUserId,
    })
    .returning();

  return row;
}

/**
 * Standalone variant for callers that are not already inside a transaction.
 * Payment confirmation uses `grantCreditsWith` instead so that marking an order
 * paid and granting credits commit together.
 */
export async function grantCreditsForOrder(
  orderId: string,
  actorUserId: string | null = null
): Promise<JobCreditLedgerRow | null> {
  const { db } = dbFromRequest();
  return db.transaction((tx) => grantCreditsWith(tx, orderId, actorUserId));
}

/**
 * Consumes exactly one credit for a job, atomically.
 *
 * Guarded four ways:
 *  1. A transaction-scoped ADVISORY lock keyed on the COMPANY id serialises all
 *     credit allocation for that company. A row lock on the job alone is not
 *     enough: two concurrent submissions for DIFFERENT jobs lock different rows,
 *     so both could read the same balance and both succeed, oversubscribing the
 *     account. Advisory locking is the only guard that orders them.
 *  2. `FOR UPDATE` on the job row serialises concurrent submissions for the SAME job.
 *  3. The balance is recomputed inside the transaction, so the decision can
 *     never rely on a stale, client-visible number.
 *  4. The unique index on `job_id` makes a second consumption of the same job
 *     impossible even if the other guards were bypassed.
 */
export async function consumeCreditForJob(input: {
  companyId: string;
  jobId: string;
  actorUserId?: string | null;
}): Promise<JobCreditLedgerRow> {
  const { db } = dbFromRequest();
  return db.transaction((tx) => consumeCreditWith(tx, input));
}

/**
 * Composable variant for callers that are already inside a transaction.
 *
 * Job submission MUST use this: consuming the credit and moving the job to
 * 'pending_approval' are one business operation, so a failure to update the job
 * has to roll the credit back too. With the standalone form the credit would
 * already be committed and the employer would be charged for a posting that
 * never went anywhere.
 */
export async function consumeCreditWith(
  tx: DbExecutor,
  input: {
    companyId: string;
    jobId: string;
    actorUserId?: string | null;
  }
): Promise<JobCreditLedgerRow> {
  // Locks are taken in a fixed order (company advisory, then job row) so two
  // concurrent transactions can never deadlock against each other.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`rvly-credits:${input.companyId}`}))`
  );
  await tx.execute(sql`SELECT id FROM jobs WHERE id = ${input.jobId} FOR UPDATE`);

  const [existing] = await tx
    .select({ id: jobCreditLedger.id })
    .from(jobCreditLedger)
    .where(eq(jobCreditLedger.jobId, input.jobId))
    .limit(1);
  if (existing) {
    throw new AppError(
      AppErrorCode.CONFLICT,
      'A job credit has already been used for this posting.',
      409
    );
  }

  // The balance is recomputed INSIDE the transaction, so the decision can
  // never rely on a stale, client-visible number.
  const balanceResult = await tx.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS available
      FROM job_credit_ledger
     WHERE company_id = ${input.companyId}
  `);
  const available = rowsFromExecute<{ available: number }>(balanceResult)[0]?.available ?? 0;

  if (available <= 0) {
    throw new AppError(
      AppErrorCode.INSUFFICIENT_CREDITS,
      'You do not have any job credits left. Purchase a job posting package to post another job.',
      402
    );
  }

  const [row] = await tx
    .insert(jobCreditLedger)
    .values({
      companyId: input.companyId,
      amount: -1,
      reason: 'job_post',
      jobId: input.jobId,
      createdByUserId: input.actorUserId ?? null,
    })
    .returning();

  return row;
}

/**
 * Returns a consumed credit when a job is withdrawn before approval.
 *
 * Writes a compensating row rather than deleting the original, so the ledger
 * stays an accurate history. Guarded against double refunding by the notes
 * marker plus the job lock.
 */
export async function refundCreditForJob(input: {
  companyId: string;
  jobId: string;
  actorUserId?: string | null;
  reason?: string;
}): Promise<boolean> {
  const { db } = dbFromRequest();
  const notes = `Refund: ${(input.reason ?? 'job withdrawn').slice(0, 200)}`;

  return db.transaction(async (tx) => {
    // Same lock ordering as consumption (company advisory, then job row) so a
    // refund can never deadlock against a concurrent consumption.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rvly-credits:${input.companyId}`}))`);
    await tx.execute(sql`SELECT id FROM jobs WHERE id = ${input.jobId} FOR UPDATE`);

    const [consumed] = await tx
      .select()
      .from(jobCreditLedger)
      .where(and(eq(jobCreditLedger.jobId, input.jobId), eq(jobCreditLedger.reason, 'job_post')))
      .limit(1);
    if (!consumed) return false;

    const already = await tx
      .select({ id: jobCreditLedger.id })
      .from(jobCreditLedger)
      .where(
        and(
          eq(jobCreditLedger.companyId, input.companyId),
          eq(jobCreditLedger.reason, 'admin_adjustment'),
          eq(jobCreditLedger.notes, notes)
        )
      )
      .limit(1);
    if (already.length > 0) return false;

    await tx.insert(jobCreditLedger).values({
      companyId: input.companyId,
      amount: 1,
      reason: 'admin_adjustment',
      jobId: null,
      notes,
      createdByUserId: input.actorUserId ?? null,
    });
    return true;
  });
}

/**
 * Manual credit adjustment by an admin. Always audited.
 * The amount is signed: positive grants, negative removes.
 */
export async function adjustCredits(input: {
  companyId: string;
  amount: number;
  adminUserId: string;
  notes: string;
  expiresAt?: Date | null;
}): Promise<JobCreditLedgerRow> {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'Adjustment amount must be a non-zero integer.'
    );
  }

  const { db } = dbFromRequest();
  const [row] = await db
    .insert(jobCreditLedger)
    .values({
      companyId: input.companyId,
      amount: input.amount,
      reason: 'admin_adjustment',
      notes: input.notes.slice(0, 500),
      expiresAt: input.expiresAt ?? null,
      createdByUserId: input.adminUserId,
    })
    .returning();

  await recordPortalAudit({
    action: 'job_credits_adjusted',
    actorUserId: input.adminUserId,
    description: `Adjusted job credits by ${input.amount}`,
    metadata: { companyId: input.companyId, amount: input.amount, ledgerId: row.id },
  });

  return row;
}

/** Ledger history for a company, newest first. */
export async function listCreditLedger(
  companyId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<JobCreditLedgerRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  return db
    .select()
    .from(jobCreditLedger)
    .where(eq(jobCreditLedger.companyId, companyId))
    .orderBy(sql`${jobCreditLedger.createdAt} DESC`)
    .limit(limit)
    .offset(offset);
}

/** Whether a job has already consumed a credit. */
export async function jobHasConsumedCredit(jobId: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const rows = await db
    .select({ id: jobCreditLedger.id })
    .from(jobCreditLedger)
    .where(and(eq(jobCreditLedger.jobId, jobId), isNull(jobCreditLedger.orderId)))
    .limit(1);
  return rows.length > 0;
}

export type { JobPackageRow, OrderRow };
