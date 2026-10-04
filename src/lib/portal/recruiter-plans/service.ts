import 'server-only';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { config } from '@/lib/config';
import { dbFromRequest } from '@/lib/db/request';
import {
  jobPostUsage,
  recruiterPlanFeatures,
  recruiterPlans,
  recruiterSubscriptions,
  recruiterSubscriptionEvents,
  type OrderRow,
  type PlanBillingPeriod,
  type RecruiterPlanRow,
  type RecruiterSubscriptionRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { consumeCreditWith, getCreditBalance } from '@/lib/portal/credits';
import { rowsFromExecute } from '@/lib/db/rows';
import type { AppDatabase } from '@/lib/db';
import { normalizeJobPostAllowance, periodEndFrom, isPlanBillingPeriod, isUpgrade } from './catalog';
import { computeAllowanceUsage, limitReachedMessage, type AllowanceUsage } from './usage';

/**
 * Recruiter plans, subscriptions and the monthly job-post allowance.
 *
 * The rules this module exists to guarantee:
 *
 *  1. WHETHER A COMPANY MAY POST IS DECIDED HERE, ON THE SERVER. A dashboard
 *     count is a report, never an authorisation: the browser cannot raise an
 *     allowance by changing anything it controls.
 *  2. USAGE IS DERIVED, NEVER STORED AS A COUNTER. "Used" is a COUNT of
 *     `job_post_usage` rows in the CURRENT billing period, so a period rollover
 *     needs no reset job and there is no stale number to leak between tenants.
 *  3. CONSUMPTION IS ATOMIC AND IDEMPOTENT. It runs inside the caller's
 *     transaction under the same company advisory lock that guards credits, and
 *     the unique index on `job_post_usage.job_id` means one posting can never
 *     consume two posts.
 *  4. ACTIVATION REQUIRES A VERIFIED PAYMENT. `activateSubscriptionFromOrder`
 *     is only ever called from the payment-confirmation path, and is idempotent
 *     per order so a replayed webhook cannot extend a subscription twice.
 */

/** Either the root database or an existing transaction. */
type DbExecutor = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export interface RecruiterPlanDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthlyMinor: number;
  priceAnnualMinor: number;
  annualListPriceMinor: number | null;
  jobPostsPerMonth: number;
  currency: string;
  supportTier: string;
  isEnterprise: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
}

function toPlanDTO(row: RecruiterPlanRow, features: string[]): RecruiterPlanDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    priceMonthlyMinor: row.priceMonthlyMinor,
    priceAnnualMinor: row.priceAnnualMinor,
    annualListPriceMinor: row.annualListPriceMinor,
    // The allowance is normalised on the way OUT as well as in, so a stored 0
    // can never surface as "unlimited" in a report or a limit check.
    jobPostsPerMonth: normalizeJobPostAllowance(row.jobPostsPerMonth),
    currency: row.currency,
    supportTier: row.supportTier,
    isEnterprise: row.isEnterprise,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    features,
  };
}

/** Features keyed by plan id, fetched once. */
async function featuresByPlan(
  executor: DbExecutor,
  planIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (planIds.length === 0) return map;
  const wanted = new Set(planIds);
  const rows = await executor
    .select({
      planId: recruiterPlanFeatures.planId,
      featureKey: recruiterPlanFeatures.featureKey,
    })
    .from(recruiterPlanFeatures)
    .orderBy(asc(recruiterPlanFeatures.sortOrder));
  for (const row of rows) {
    if (!wanted.has(row.planId)) continue;
    const list = map.get(row.planId) ?? [];
    list.push(row.featureKey);
    map.set(row.planId, list);
  }
  return map;
}

/** The public plan catalogue. Active plans only unless asked otherwise. */
export async function listRecruiterPlans(
  options: { includeInactive?: boolean } = {}
): Promise<RecruiterPlanDTO[]> {
  const { db } = dbFromRequest();
  const ordered = [asc(recruiterPlans.sortOrder), asc(recruiterPlans.code)] as const;
  const rows = options.includeInactive
    ? await db.select().from(recruiterPlans).orderBy(...ordered)
    : await db
        .select()
        .from(recruiterPlans)
        .where(eq(recruiterPlans.isActive, true))
        .orderBy(...ordered);

  const features = await featuresByPlan(
    db,
    rows.map((row) => row.id)
  );
  return rows.map((row) => toPlanDTO(row, features.get(row.id) ?? []));
}

/** One plan by id. Reads on the supplied executor so it can join a transaction. */
export async function getRecruiterPlan(
  planId: string,
  executor?: DbExecutor
): Promise<RecruiterPlanDTO> {
  const target = executor ?? dbFromRequest().db;
  const [row] = await target
    .select()
    .from(recruiterPlans)
    .where(eq(recruiterPlans.id, planId))
    .limit(1);
  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested plan was not found.', 404);
  }
  const features = await featuresByPlan(target, [row.id]);
  return toPlanDTO(row, features.get(row.id) ?? []);
}

/** One plan by its stable code. */
export async function getRecruiterPlanByCode(
  code: string,
  executor?: DbExecutor
): Promise<RecruiterPlanDTO> {
  const target = executor ?? dbFromRequest().db;
  const [row] = await target
    .select()
    .from(recruiterPlans)
    .where(eq(recruiterPlans.code, code))
    .limit(1);
  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested plan was not found.', 404);
  }
  const features = await featuresByPlan(target, [row.id]);
  return toPlanDTO(row, features.get(row.id) ?? []);
}

/** The company's subscription row, if any. */
export async function getSubscriptionRow(
  companyId: string,
  executor?: DbExecutor
): Promise<RecruiterSubscriptionRow | null> {
  const target = executor ?? dbFromRequest().db;
  const [row] = await target
    .select()
    .from(recruiterSubscriptions)
    .where(eq(recruiterSubscriptions.companyId, companyId))
    .limit(1);
  return row ?? null;
}

/** Appends a lifecycle event. Never throws: history must not fail a request. */
export async function recordSubscriptionEventWith(
  executor: DbExecutor,
  input: {
    subscriptionId: string;
    eventType: string;
    fromPlanId?: string | null;
    toPlanId?: string | null;
    billingPeriod?: string | null;
    amountMinor?: number | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
    actorUserId?: string | null;
  }
): Promise<void> {
  try {
    await executor.insert(recruiterSubscriptionEvents).values({
      subscriptionId: input.subscriptionId,
      eventType: input.eventType,
      fromPlanId: input.fromPlanId ?? null,
      toPlanId: input.toPlanId ?? null,
      billingPeriod: input.billingPeriod ?? null,
      amountMinor: input.amountMinor ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? null,
      actorUserId: input.actorUserId ?? null,
    });
  } catch {
    // History is secondary to the business change it describes.
  }
}

/** Lifecycle history for one subscription, newest first. */
export async function listSubscriptionEvents(
  subscriptionId: string,
  limit = 50
): Promise<Array<typeof recruiterSubscriptionEvents.$inferSelect>> {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(recruiterSubscriptionEvents)
    .where(eq(recruiterSubscriptionEvents.subscriptionId, subscriptionId))
    .orderBy(desc(recruiterSubscriptionEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

/**
 * Posts consumed in a period, derived from the usage ledger.
 *
 * Counting rows (rather than reading a counter) means the number can always be
 * recomputed and can never disagree with the history.
 */
export async function countPostsUsedInPeriod(
  executor: DbExecutor,
  companyId: string,
  periodStart: Date | null
): Promise<number> {
  const result = await executor.execute(sql`
    SELECT COUNT(*)::int AS used
      FROM job_post_usage
     WHERE company_id = ${companyId}
       AND released_at IS NULL
       AND period_start = ${periodStart ?? new Date(0)}
  `);
  return rowsFromExecute<{ used: number }>(result)[0]?.used ?? 0;
}

/**
 * Applies the time-based parts of the lifecycle to a subscription row.
 *
 * Called lazily whenever a subscription is read, so an expired subscription is
 * never treated as active just because no scheduled job has run yet. Renewal
 * periods use `periodEndFrom` (calendar months), so a monthly plan renews on the
 * same day each month instead of drifting earlier every cycle.
 */
export async function refreshSubscriptionLifecycle(
  row: RecruiterSubscriptionRow,
  now: Date = new Date(),
  executor?: DbExecutor
): Promise<RecruiterSubscriptionRow | null> {
  const target = executor ?? dbFromRequest().db;
  const end = row.currentPeriodEnd;

  // Nothing time-based applies to a subscription that was never activated, or
  // to one already cancelled or expired.
  if (row.status === 'pending' || row.status === 'cancelled' || row.status === 'expired') return row;
  if (!end) return row;

  if (end.getTime() > now.getTime()) {
    // Still inside the period. Flag an upcoming renewal once, for the dashboard.
    if (row.status === 'active') {
      const warnFrom = new Date(
        end.getTime() - Math.max(0, config.RECRUITER_RENEWAL_WARNING_DAYS) * 24 * 60 * 60 * 1000
      );
      if (now.getTime() >= warnFrom.getTime()) {
        const [updated] = await target
          .update(recruiterSubscriptions)
          .set({ status: 'expiring', updatedAt: now })
          .where(
            and(eq(recruiterSubscriptions.id, row.id), eq(recruiterSubscriptions.status, 'active'))
          )
          .returning();
        return updated ?? row;
      }
    }
    return row;
  }

  // The period has ended.
  if (row.cancelAtPeriodEnd) {
    const [updated] = await target
      .update(recruiterSubscriptions)
      .set({ status: 'expired', updatedAt: now, cancelledAt: row.cancelledAt ?? now })
      .where(eq(recruiterSubscriptions.id, row.id))
      .returning();
    await recordSubscriptionEventWith(target, {
      subscriptionId: row.id,
      eventType: 'expired',
      toPlanId: row.planId,
      billingPeriod: row.billingPeriod,
      notes: 'Period ended with cancellation requested, so the plan expired.',
      metadata: { periodEnd: end.toISOString() },
    });
    return updated ?? null;
  }

  /**
   * Auto-renewal.
   *
   * The platform renews by extending the period and recording the event. The
   * MONEY is a separate concern handled by the provider's own mandate (or a
   * fresh checkout): a renewal here never invents a payment, and `amountMinor`
   * is left as the last amount actually charged.
   */
  const nextStart = end;
  const nextEnd = periodEndFrom(nextStart, row.billingPeriod as PlanBillingPeriod);
  const [updated] = await target
    .update(recruiterSubscriptions)
    .set({
      status: 'active',
      currentPeriodStart: nextStart,
      currentPeriodEnd: nextEnd,
      renewalAt: nextEnd,
      updatedAt: now,
    })
    .where(eq(recruiterSubscriptions.id, row.id))
    .returning();

  await recordSubscriptionEventWith(target, {
    subscriptionId: row.id,
    eventType: 'renewed',
    toPlanId: row.planId,
    billingPeriod: row.billingPeriod,
    notes: 'Billing period rolled over.',
    metadata: { periodStart: nextStart.toISOString(), periodEnd: nextEnd.toISOString() },
  });

  return updated ?? row;
}

export interface CompanyPlanOverview {
  subscription: {
    id: string;
    status: string;
    billingPeriod: string;
    amountMinor: number;
    currency: string;
    startedAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    renewalAt: string | null;
    cancelAtPeriodEnd: boolean;
    planCode: string;
    planName: string;
  } | null;
  plan: RecruiterPlanDTO | null;
  features: string[];
  /** Null when there is no subscription: an allowance only exists with a plan. */
  usage: AllowanceUsage | null;
  /** Prepaid job credits, which act as an overflow once the allowance is spent. */
  creditsAvailable: number;
  /** Allowance remaining plus credits — what the employer can actually spend. */
  postsRemaining: number;
  limitEnforced: boolean;
  requiresActivePlan: boolean;
  /** True when the employer may submit another posting right now. */
  canPost: boolean;
}

/**
 * Everything the dashboard needs, computed server-side in one place.
 *
 * The same function answers "may this company post?" and "what does the
 * dashboard show?", which is what keeps the reported numbers and the enforced
 * rule from ever disagreeing.
 */
export async function getCompanyPlanOverview(
  companyId: string,
  now: Date = new Date()
): Promise<CompanyPlanOverview> {
  const { db } = dbFromRequest();

  let row = await getSubscriptionRow(companyId, db);
  if (row) row = await refreshSubscriptionLifecycle(row, now, db);

  const plan = row ? await getRecruiterPlan(row.planId, db) : null;
  const usable = row && plan && (row.status === 'active' || row.status === 'expiring');

  const used = usable ? await countPostsUsedInPeriod(db, companyId, row!.currentPeriodStart) : 0;
  const usage = usable
    ? computeAllowanceUsage({
        allowance: plan!.jobPostsPerMonth,
        used,
        warningThreshold: config.RECRUITER_LIMIT_WARNING_RATIO,
      })
    : null;

  const balance = await getCreditBalance(companyId);
  const creditsAvailable = Math.max(0, balance.available);
  const allowanceRemaining = usage?.remaining ?? 0;

  const limitEnforced = config.RECRUITER_JOB_LIMIT_ENFORCED;
  const requiresActivePlan = config.RECRUITER_REQUIRE_ACTIVE_PLAN;
  // A plan requirement applies whatever the limit flag says; otherwise, with
  // enforcement off the plan allowance is ADVISORY and only the prepaid-credit
  // rule (applied at consumption time) decides whether a post may proceed.
  const canPost = requiresActivePlan && !usage
    ? false
    : limitEnforced
      ? allowanceRemaining > 0 || creditsAvailable > 0 || !usage
      : true;

  return {
    subscription: row
      ? {
          id: row.id,
          status: row.status,
          billingPeriod: row.billingPeriod,
          amountMinor: row.amountMinor,
          currency: row.currency,
          startedAt: row.startedAt ? row.startedAt.toISOString() : null,
          currentPeriodStart: row.currentPeriodStart ? row.currentPeriodStart.toISOString() : null,
          currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
          renewalAt: row.renewalAt ? row.renewalAt.toISOString() : null,
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          planCode: plan?.code ?? '',
          planName: plan?.name ?? '',
        }
      : null,
    plan,
    features: plan?.features ?? [],
    usage,
    creditsAvailable,
    postsRemaining: allowanceRemaining + creditsAvailable,
    limitEnforced,
    requiresActivePlan,
    canPost,
  };
}

/**
 * Throws the limit-reached error unless the employer has room for one more post.
 *
 * This is the authoritative check. It is called BEFORE any write, and the
 * consumption step re-checks inside the transaction, so a request that races a
 * second one for the last remaining post still loses cleanly.
 */
export async function assertCanPostJob(companyId: string): Promise<CompanyPlanOverview> {
  const overview = await getCompanyPlanOverview(companyId);
  if (overview.canPost) return overview;

  const allowance = overview.plan?.jobPostsPerMonth ?? 0;
  throw new AppError(
    AppErrorCode.PLAN_LIMIT_REACHED,
    limitReachedMessage({ planName: overview.plan?.name ?? null, allowance }),
    402,
    {
      planName: overview.plan?.name ?? null,
      allowance,
      used: overview.usage?.used ?? 0,
      remaining: overview.usage?.remaining ?? 0,
      creditsAvailable: overview.creditsAvailable,
      upgradeHref: '/employer/subscription',
    }
  );
}

/** Whether the company's current plan includes a capability. */
export async function hasPlanFeature(companyId: string, featureKey: string): Promise<boolean> {
  const overview = await getCompanyPlanOverview(companyId);
  return overview.features.includes(featureKey);
}

/**
 * Throws unless the plan includes the capability.
 *
 * Employed by the resume database, candidate search, interview management and
 * reporting routes, so a lower tier cannot reach a higher tier's tools by
 * calling an endpoint directly.
 */
export async function requirePlanFeature(
  companyId: string,
  featureKey: string
): Promise<CompanyPlanOverview> {
  const overview = await getCompanyPlanOverview(companyId);
  if (overview.features.includes(featureKey)) return overview;
  throw new AppError(
    AppErrorCode.FORBIDDEN,
    'Your current plan does not include this feature. Upgrade your plan to use it.',
    403,
    { featureKey, upgradeHref: '/employer/subscription' }
  );
}

export type PostingFundingSource = 'plan_allowance' | 'credit';

/**
 * Consumes one job post, atomically, inside the caller's transaction.
 *
 * Order of spending is fixed: the inclusive plan allowance is used first and
 * prepaid credits only afterwards. That is the commercially sensible order
 * (use what you have already paid for monthly before burning a prepaid credit)
 * and, more importantly, a deterministic one — there is no branch a caller can
 * influence.
 *
 * The company advisory lock is the same key the credit ledger uses, so an
 * allowance consumption and a credit consumption for the same company can never
 * interleave.
 */
export async function consumeJobPostWith(
  tx: DbExecutor,
  input: { companyId: string; jobId: string; actorUserId?: string | null }
): Promise<{ source: PostingFundingSource }> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`rvly-credits:${input.companyId}`}))`
  );

  // Idempotency: this posting has already consumed something. Re-returning the
  // earlier outcome makes a retried submission safe instead of double-charging.
  // A RELEASED row is the exception: the withdrawal gave the post back, so a
  // re-submission must consume again — done by reusing the released row, since
  // the unique index on job_id forbids a second one.
  const [existingUsage] = await tx
    .select({ id: jobPostUsage.id, releasedAt: jobPostUsage.releasedAt })
    .from(jobPostUsage)
    .where(eq(jobPostUsage.jobId, input.jobId))
    .limit(1);
  if (existingUsage && existingUsage.releasedAt === null) return { source: 'plan_allowance' };

  let row = await getSubscriptionRow(input.companyId, tx);
  const now = new Date();
  if (row) row = await refreshSubscriptionLifecycle(row, now, tx);

  const usable =
    row !== null &&
    row !== undefined &&
    (row.status === 'active' || row.status === 'expiring') &&
    row.currentPeriodStart !== null &&
    row.currentPeriodEnd !== null;

  let planName: string | null = null;
  let allowance = 0;
  let used = 0;

  if (usable) {
    const plan = await getRecruiterPlan(row!.planId, tx);
    planName = plan.name;
    allowance = normalizeJobPostAllowance(plan.jobPostsPerMonth);
    used = await countPostsUsedInPeriod(tx, input.companyId, row!.currentPeriodStart);

    if (used < allowance) {
      if (existingUsage) {
        // Re-submission after a withdrawal: reuse the released row and charge
        // it to the CURRENT billing period, so the allowance check that just
        // passed is what this post counts against.
        await tx
          .update(jobPostUsage)
          .set({
            subscriptionId: row!.id,
            periodStart: row!.currentPeriodStart!,
            periodEnd: row!.currentPeriodEnd!,
            consumedByUserId: input.actorUserId ?? null,
            consumedAt: now,
            releasedAt: null,
            releaseReason: null,
          })
          .where(eq(jobPostUsage.id, existingUsage.id));
        return { source: 'plan_allowance' };
      }

      const inserted = await tx
        .insert(jobPostUsage)
        .values({
          companyId: input.companyId,
          subscriptionId: row!.id,
          jobId: input.jobId,
          periodStart: row!.currentPeriodStart!,
          periodEnd: row!.currentPeriodEnd!,
          consumedByUserId: input.actorUserId ?? null,
          consumedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: jobPostUsage.id });

      // Either we inserted the usage row, or a concurrent request already did
      // for this same job — both mean the post is accounted for.
      if (inserted.length > 0 || used < allowance) {
        return { source: 'plan_allowance' };
      }
    }
  }

  // `RECRUITER_REQUIRE_ACTIVE_PLAN` means no credit fallback exists: posting
  // without a plan must fail as a PLAN problem, not as a balance problem.
  if (!usable && config.RECRUITER_REQUIRE_ACTIVE_PLAN) {
    throw new AppError(
      AppErrorCode.PLAN_LIMIT_REACHED,
      'Your company needs an active plan to post jobs. Choose a plan to continue.',
      402,
      {
        planName: null,
        allowance: 0,
        used: 0,
        remaining: 0,
        creditsAvailable: 0,
        upgradeHref: '/employer/subscription',
      }
    );
  }

  // The allowance is spent (or there is no plan). Fall back to prepaid credits,
  // which enforce their own balance and raise INSUFFICIENT_CREDITS when empty.
  try {
    await consumeCreditWith(tx, {
      companyId: input.companyId,
      jobId: input.jobId,
      actorUserId: input.actorUserId ?? null,
    });
    return { source: 'credit' };
  } catch (error) {
    // Only a company that HAD a plan allowance sees a plan-shaped error. With
    // no plan at all, the honest answer is the credit balance message.
    if (
      planName !== null &&
      error instanceof AppError &&
      error.code === AppErrorCode.INSUFFICIENT_CREDITS
    ) {
      throw new AppError(
        AppErrorCode.PLAN_LIMIT_REACHED,
        limitReachedMessage({ planName, allowance }),
        402,
        {
          planName,
          allowance,
          used,
          remaining: 0,
          creditsAvailable: 0,
          upgradeHref: '/employer/subscription',
        }
      );
    }
    throw error;
  }
}

/**
 * Returns the post a withdrawn job consumed.
 *
 * Writes a release marker on the usage row (rather than deleting it) so the
 * audit trail survives, and falls back to a credit refund when the post came
 * from the prepaid ledger.
 */
export async function releaseJobPostForJob(input: {
  companyId: string;
  jobId: string;
  actorUserId?: string | null;
  reason?: string;
}): Promise<{ released: PostingFundingSource | null }> {
  const { db } = dbFromRequest();
  const reason = (input.reason ?? 'job withdrawn').slice(0, 200);

  const [usage] = await db
    .select()
    .from(jobPostUsage)
    .where(and(eq(jobPostUsage.jobId, input.jobId), eq(jobPostUsage.companyId, input.companyId)))
    .limit(1);

  if (usage && usage.releasedAt === null) {
    const [updated] = await db
      .update(jobPostUsage)
      .set({ releasedAt: new Date(), releaseReason: reason })
      .where(and(eq(jobPostUsage.id, usage.id), sql`${jobPostUsage.releasedAt} is null`))
      .returning({ id: jobPostUsage.id });
    if (updated) return { released: 'plan_allowance' };
    return { released: null };
  }

  const { refundCreditForJob } = await import('@/lib/portal/credits');
  const refunded = await refundCreditForJob({
    companyId: input.companyId,
    jobId: input.jobId,
    actorUserId: input.actorUserId ?? null,
    reason,
  });
  return { released: refunded ? 'credit' : null };
}

/* ==========================================================================
 * ACTIVATION FROM A VERIFIED PAYMENT
 * ==========================================================================
 * Called ONLY inside `markOrderPaidAndGrantCredits`'s transaction, after the
 * order status guard has claimed the order exactly once. A replayed webhook can
 * never reach this function twice for the same order (the order UPDATE matches
 * zero rows first), and the `subscription.orderId` check below is a second,
 * independent backstop for any direct caller.
 */

export interface ActivatedSubscription {
  subscriptionId: string;
  /** True when this order had already been applied to the subscription. */
  alreadyApplied: boolean;
  eventType: 'activated' | 'renewed' | 'upgraded' | 'downgraded';
  planId: string;
  planCode: string;
  planName: string;
  billingPeriod: PlanBillingPeriod;
  /** Gross amount charged for the period (the order's amount). */
  amountMinor: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}

function activationResult(
  row: RecruiterSubscriptionRow,
  plan: RecruiterPlanRow,
  eventType: ActivatedSubscription['eventType'],
  billingPeriod: PlanBillingPeriod,
  alreadyApplied: boolean
): ActivatedSubscription {
  return {
    subscriptionId: row.id,
    alreadyApplied,
    eventType,
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    billingPeriod,
    amountMinor: row.amountMinor,
    currency: row.currency,
    periodStart: row.currentPeriodStart ?? new Date(),
    periodEnd: row.currentPeriodEnd ?? periodEndFrom(new Date(), billingPeriod),
  };
}

/** Reads a plan row on an executor, or null when it no longer exists. */
async function getPlanRow(executor: DbExecutor, planId: string): Promise<RecruiterPlanRow | null> {
  const [row] = await executor
    .select()
    .from(recruiterPlans)
    .where(eq(recruiterPlans.id, planId))
    .limit(1);
  return row ?? null;
}

/**
 * Activates (or renews / changes) a company's subscription from a PAID order.
 *
 * Runs entirely on the caller's executor so the order can never commit as paid
 * while the subscription fails to apply — a paid-but-unactivated company would
 * be the worst failure mode for a customer who has just been charged.
 *
 * Period rules:
 *  - First purchase and re-activation after expiry start the period NOW.
 *  - Renewing the SAME plan while still active extends from the current period
 *    end, so paying early never shortens what the buyer already paid for.
 *  - A plan CHANGE starts a fresh period immediately: the new allowance is
 *    available at once and the old usage rows belong to the old period.
 */
export async function activateSubscriptionFromOrder(
  tx: DbExecutor,
  input: { order: OrderRow; paymentId?: string | null; now?: Date }
): Promise<ActivatedSubscription> {
  const { order } = input;
  if (order.orderType !== 'recruiter_plan') {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'This order is not a recruiter plan purchase.',
      400
    );
  }

  const now = input.now ?? new Date();

  // The plan is read on THIS executor: a second connection would deadlock
  // against the transaction that already holds the only one.
  const planRow = await getPlanRow(tx, order.packageId);
  if (!planRow) {
    throw new AppError(
      AppErrorCode.INTERNAL_ERROR,
      'The purchased plan could not be resolved. Payment captured without activation.',
      500
    );
  }

  // The period bought is carried on the order. The amount is only a fallback
  // for rows written before that column existed — never the primary source,
  // because an admin may reprice a plan between checkout and payment.
  let billingPeriod: PlanBillingPeriod = 'monthly';
  if (order.billingPeriod !== null && isPlanBillingPeriod(order.billingPeriod)) {
    billingPeriod = order.billingPeriod;
  } else if (planRow.priceAnnualMinor > 0 && order.amountMinor === planRow.priceAnnualMinor) {
    billingPeriod = 'annual';
  }

  // One subscription row per company: serialize every writer for this company
  // so two simultaneous payments cannot interleave their updates.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`rvly-subscription:${order.companyId}`}))`
  );

  const [existing] = await tx
    .select()
    .from(recruiterSubscriptions)
    .where(eq(recruiterSubscriptions.companyId, order.companyId))
    .limit(1);

  // Second idempotency guard: this exact order was already applied.
  if (existing && existing.orderId === order.id) {
    const plan =
      existing.planId === planRow.id ? planRow : ((await getPlanRow(tx, existing.planId)) ?? planRow);
    const period =
      existing.billingPeriod !== null && isPlanBillingPeriod(existing.billingPeriod)
        ? existing.billingPeriod
        : billingPeriod;
    return activationResult(existing, plan, 'activated', period, true);
  }

  const terminal =
    !existing ||
    existing.status === 'expired' ||
    existing.status === 'cancelled' ||
    existing.status === 'pending';

  let periodStart = now;
  let eventType: ActivatedSubscription['eventType'] = 'activated';

  if (existing) {
    const samePlan = existing.planId === planRow.id;
    const stillRunning =
      (existing.status === 'active' || existing.status === 'expiring') &&
      existing.currentPeriodEnd !== null &&
      existing.currentPeriodEnd.getTime() > now.getTime();

    if (terminal) {
      eventType = 'activated';
    } else if (samePlan) {
      eventType = 'renewed';
      // Paying before the current period ends extends it rather than restarting
      // it, so the buyer keeps every day they already paid for.
      if (stillRunning && existing.currentPeriodEnd) periodStart = existing.currentPeriodEnd;
    } else {
      const oldPlan = await getPlanRow(tx, existing.planId);
      eventType =
        oldPlan && !isUpgrade(oldPlan.sortOrder, planRow.sortOrder) ? 'downgraded' : 'upgraded';
    }
  }

  const periodEnd = periodEndFrom(periodStart, billingPeriod);

  const row = existing
    ? (
        await tx
          .update(recruiterSubscriptions)
          .set({
            planId: planRow.id,
            status: 'active',
            billingPeriod,
            amountMinor: order.amountMinor,
            currency: order.currency,
            startedAt: existing.startedAt ?? periodStart,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            renewalAt: periodEnd,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            orderId: order.id,
            paymentId: input.paymentId ?? null,
            updatedAt: now,
          })
          .where(eq(recruiterSubscriptions.id, existing.id))
          .returning()
      )[0]
    : (
        await tx
          .insert(recruiterSubscriptions)
          .values({
            companyId: order.companyId,
            planId: planRow.id,
            status: 'active',
            billingPeriod,
            amountMinor: order.amountMinor,
            currency: order.currency,
            startedAt: periodStart,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            renewalAt: periodEnd,
            cancelAtPeriodEnd: false,
            orderId: order.id,
            paymentId: input.paymentId ?? null,
            createdByUserId: order.userId,
          })
          .returning()
      )[0];

  if (!row) {
    throw new AppError(
      AppErrorCode.INTERNAL_ERROR,
      'Subscription could not be activated. Payment captured without activation.',
      500
    );
  }

  await recordSubscriptionEventWith(tx, {
    subscriptionId: row.id,
    eventType,
    fromPlanId: existing && existing.planId !== planRow.id ? existing.planId : null,
    toPlanId: planRow.id,
    billingPeriod,
    amountMinor: order.amountMinor,
    notes: `Order ${order.orderNumber} settled.`,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      previousStatus: existing?.status ?? null,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
    actorUserId: order.userId,
  });

  return activationResult(row, planRow, eventType, billingPeriod, false);
}