import 'server-only';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  candidateEntitlements,
  candidatePremiumPlanEntitlements,
  candidatePremiumPlans,
  candidatePremiumSubscriptions,
  premiumEntitlements,
  type CandidatePremiumPlanRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import type { AppDatabase } from '@/lib/db';
import { recordPortalAudit } from '@/lib/portal/audit';

/**
 * Candidate premium (see §6).
 *
 * Premium is MODELLED, not a flag: plan -> subscription -> entitlement. A future
 * premium feature is added by inserting an entitlement row and mapping it to a
 * plan — the user model and the request path never change.
 *
 * No commercial pricing is hard-coded anywhere: every price lives on a
 * `candidate_premium_plans` row created by an admin, and is read from the
 * database at purchase time.
 */

export interface EntitlementDTO {
  code: string;
  name: string;
  description: string | null;
  expiresAt: string | null;
}

/** Active, non-revoked, non-expired entitlements for a candidate. */
export async function listCandidateEntitlements(
  candidateId: string,
  now: Date = new Date()
): Promise<EntitlementDTO[]> {
  const { db } = dbFromRequest();

  const rows = await db
    .select({
      code: premiumEntitlements.code,
      name: premiumEntitlements.name,
      description: premiumEntitlements.description,
      expiresAt: candidateEntitlements.expiresAt,
    })
    .from(candidateEntitlements)
    .innerJoin(
      premiumEntitlements,
      eq(candidateEntitlements.entitlementId, premiumEntitlements.id)
    )
    .where(
      and(
        eq(candidateEntitlements.candidateId, candidateId),
        isNull(candidateEntitlements.revokedAt),
        or(isNull(candidateEntitlements.expiresAt), gt(candidateEntitlements.expiresAt, now))
      )
    )
    .orderBy(premiumEntitlements.code);

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    description: row.description,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }));
}

/**
 * Whether the candidate holds a specific entitlement, on a caller's executor.
 *
 * USE THIS INSIDE A TRANSACTION. `hasEntitlement` runs on the root connection,
 * and PGlite and a single-connection pool deadlock if a non-transactional query
 * runs while a transaction still holds the only connection. Checking on the
 * caller's executor also keeps the gate atomic: a check-then-insert on the root
 * connection could pass and then be overtaken before the write commits.
 */
export async function hasEntitlementWith(
  executor: DbExecutor,
  candidateId: string,
  entitlementCode: string,
  now: Date = new Date()
): Promise<boolean> {
  const [row] = await executor
    .select({ id: candidateEntitlements.id })
    .from(candidateEntitlements)
    .innerJoin(premiumEntitlements, eq(candidateEntitlements.entitlementId, premiumEntitlements.id))
    .where(
      and(
        eq(candidateEntitlements.candidateId, candidateId),
        eq(premiumEntitlements.code, entitlementCode),
        isNull(candidateEntitlements.revokedAt),
        or(isNull(candidateEntitlements.expiresAt), gt(candidateEntitlements.expiresAt, now))
      )
    )
    .limit(1);

  return row !== undefined;
}

/** Whether the candidate currently holds a specific entitlement. */
export async function hasEntitlement(
  candidateId: string,
  entitlementCode: string,
  now: Date = new Date()
): Promise<boolean> {
  return hasEntitlementWith(dbFromRequest().db, candidateId, entitlementCode, now);
}

/**
 * Requires an entitlement, throwing a 403 with the entitlement name.
 * Premium-gated features call this on the server; the client never decides.
 */
export async function requireEntitlement(
  candidateId: string,
  entitlementCode: string
): Promise<void> {
  await requireEntitlementWith(dbFromRequest().db, candidateId, entitlementCode);
}

/** The transactional form of `requireEntitlement`. See `hasEntitlementWith`. */
export async function requireEntitlementWith(
  executor: DbExecutor,
  candidateId: string,
  entitlementCode: string
): Promise<void> {
  if (await hasEntitlementWith(executor, candidateId, entitlementCode)) return;
  throw new AppError(
    AppErrorCode.FORBIDDEN,
    'This feature requires an active premium plan.',
    403
  );
}

/** Public plan catalogue, with the entitlements each plan includes. */
export async function listActivePlans(): Promise<
  Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    priceMinor: number;
    currency: string;
    billingPeriod: string;
    durationDays: number;
    entitlements: string[];
  }>
> {
  const { db } = dbFromRequest();

  const plans = await db
    .select()
    .from(candidatePremiumPlans)
    .where(eq(candidatePremiumPlans.isActive, true))
    .orderBy(candidatePremiumPlans.sortOrder, candidatePremiumPlans.priceMinor);

  if (plans.length === 0) return [];

  // One query for all mappings, then group in memory: no N+1 per plan.
  const mappings = await db
    .select({
      planId: candidatePremiumPlanEntitlements.planId,
      code: premiumEntitlements.code,
    })
    .from(candidatePremiumPlanEntitlements)
    .innerJoin(
      premiumEntitlements,
      eq(candidatePremiumPlanEntitlements.entitlementId, premiumEntitlements.id)
    );

  const byPlan = new Map<string, string[]>();
  for (const mapping of mappings) {
    const list = byPlan.get(mapping.planId) ?? [];
    list.push(mapping.code);
    byPlan.set(mapping.planId, list);
  }

  return plans.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
    durationDays: plan.durationDays,
    entitlements: byPlan.get(plan.id) ?? [],
  }));
}

/**
 * One plan by id, reading the authoritative price from the database.
 *
 * Accepts an executor so a caller already inside a transaction can resolve the
 * plan WITHOUT taking a second connection. That matters: PGlite and a
 * single-connection pool both deadlock if a non-transactional query runs while
 * the transaction still holds the only connection.
 */
export async function getPlan(
  planId: string,
  executor?: DbExecutor
): Promise<CandidatePremiumPlanRow> {
  const db = executor ?? dbFromRequest().db;
  const [plan] = await db
    .select()
    .from(candidatePremiumPlans)
    .where(and(eq(candidatePremiumPlans.id, planId), eq(candidatePremiumPlans.isActive, true)))
    .limit(1);
  if (!plan) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested plan was not found.', 404);
  return plan;
}

/** Either the root database or an existing transaction, for composable helpers. */
export type DbExecutor = Pick<
  AppDatabase,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;

/**
 * Activates a subscription inside an EXISTING transaction.
 *
 * Payment confirmation must use this rather than the standalone wrapper: the
 * order must never be able to commit as paid while the subscription and its
 * entitlements fail, which would leave a customer who has paid with nothing to
 * show for it. Everything below therefore runs on the caller's executor.
 *
 * Auditing is the caller's responsibility, because an audit written inside a
 * business transaction would be rolled back along with it.
 */
export async function activateSubscriptionWith(
  tx: DbExecutor,
  input: {
    candidateId: string;
    plan: CandidatePremiumPlanRow;
    orderId?: string | null;
    paymentId?: string | null;
    now?: Date;
  }
): Promise<{ subscriptionId: string; granted: string[] }> {
  const now = input.now ?? new Date();
  const plan = input.plan;

  // Supersede any earlier active subscription for this candidate.
  await tx
    .update(candidatePremiumSubscriptions)
    .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(candidatePremiumSubscriptions.candidateId, input.candidateId),
        eq(candidatePremiumSubscriptions.status, 'active')
      )
    );

  const [subscription] = await tx
    .insert(candidatePremiumSubscriptions)
    .values({
      candidateId: input.candidateId,
      planId: plan.id,
      status: 'active',
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + plan.durationDays * 86_400_000),
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
    })
    .returning();

  // Materialise exactly the entitlements this plan maps to.
  const mapped = await tx
    .select({ id: premiumEntitlements.id, code: premiumEntitlements.code })
    .from(candidatePremiumPlanEntitlements)
    .innerJoin(
      premiumEntitlements,
      eq(candidatePremiumPlanEntitlements.entitlementId, premiumEntitlements.id)
    )
    .where(eq(candidatePremiumPlanEntitlements.planId, plan.id));

  const expiresAt = new Date(now.getTime() + plan.durationDays * 86_400_000);

  for (const entitlement of mapped) {
    await tx
      .insert(candidateEntitlements)
      .values({
        candidateId: input.candidateId,
        entitlementId: entitlement.id,
        subscriptionId: subscription.id,
        grantedAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [candidateEntitlements.candidateId, candidateEntitlements.entitlementId],
        set: { revokedAt: null, grantedAt: now, expiresAt, subscriptionId: subscription.id },
      });
  }

  return { subscriptionId: subscription.id, granted: mapped.map((row) => row.code) };
}

/**
 * Activates a subscription and materialises its entitlements.
 *
 * Called ONLY after a verified payment. Everything happens in one transaction
 * so a candidate is never left with a paid-but-ungranted state (or an active
 * subscription with no entitlements).
 */
export async function activateSubscription(input: {
  candidateId: string;
  planId: string;
  orderId?: string | null;
  paymentId?: string | null;
  now?: Date;
}): Promise<{ subscriptionId: string; granted: string[] }> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const plan = await getPlan(input.planId);

  const result = await db.transaction(async (tx) => {
    // Supersede any earlier active subscription for this candidate.
    await tx
      .update(candidatePremiumSubscriptions)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(
        and(
          eq(candidatePremiumSubscriptions.candidateId, input.candidateId),
          eq(candidatePremiumSubscriptions.status, 'active')
        )
      );

    const [subscription] = await tx
      .insert(candidatePremiumSubscriptions)
      .values({
        candidateId: input.candidateId,
        planId: plan.id,
        status: 'active',
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + plan.durationDays * 86_400_000),
        orderId: input.orderId ?? null,
        paymentId: input.paymentId ?? null,
      })
      .returning();

    // Materialise exactly the entitlements this plan maps to.
    const mapped = await tx
      .select({ id: premiumEntitlements.id, code: premiumEntitlements.code })
      .from(candidatePremiumPlanEntitlements)
      .innerJoin(
        premiumEntitlements,
        eq(candidatePremiumPlanEntitlements.entitlementId, premiumEntitlements.id)
      )
      .where(eq(candidatePremiumPlanEntitlements.planId, plan.id));

    const expiresAt = new Date(now.getTime() + plan.durationDays * 86_400_000);

    for (const entitlement of mapped) {
      await tx
        .insert(candidateEntitlements)
        .values({
          candidateId: input.candidateId,
          entitlementId: entitlement.id,
          subscriptionId: subscription.id,
          grantedAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [candidateEntitlements.candidateId, candidateEntitlements.entitlementId],
          set: { revokedAt: null, grantedAt: now, expiresAt, subscriptionId: subscription.id },
        });
    }

    return { subscriptionId: subscription.id, granted: mapped.map((row) => row.code) };
  });

  await recordPortalAudit({
    action: 'subscription_created',
    description: `Premium subscription activated: ${plan.code}`,
    metadata: {
      candidateId: input.candidateId,
      planId: plan.id,
      entitlements: result.granted,
    },
  });

  return result;
}

/** Cancels at the end of the current period rather than immediately. */
export async function cancelSubscription(input: {
  candidateId: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const updated = await db
    .update(candidatePremiumSubscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: now })
    .where(
      and(
        eq(candidatePremiumSubscriptions.candidateId, input.candidateId),
        eq(candidatePremiumSubscriptions.status, 'active')
      )
    )
    .returning({ id: candidatePremiumSubscriptions.id });

  if (updated.length === 0) return false;

  await recordPortalAudit({
    action: 'subscription_status_changed',
    description: 'Premium subscription set to cancel at period end',
    metadata: { candidateId: input.candidateId, subscriptionId: updated[0].id },
  });
  return true;
}

/**
 * Revokes an entitlement immediately. Used when a subscription ends, is
 * cancelled, or an admin acts. The grant row is kept (with revoked_at set) so the
 * history of what was granted is auditable.
 */
export async function revokeEntitlement(input: {
  candidateId: string;
  entitlementCode: string;
  adminUserId?: string | null;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [row] = await db
    .select({ id: candidateEntitlements.id, code: premiumEntitlements.code })
    .from(candidateEntitlements)
    .innerJoin(premiumEntitlements, eq(candidateEntitlements.entitlementId, premiumEntitlements.id))
    .where(
      and(
        eq(candidateEntitlements.candidateId, input.candidateId),
        eq(premiumEntitlements.code, input.entitlementCode)
      )
    )
    .limit(1);
  if (!row) return false;

  await db
    .update(candidateEntitlements)
    .set({ revokedAt: now })
    .where(and(eq(candidateEntitlements.id, row.id), isNull(candidateEntitlements.revokedAt)));

  await recordPortalAudit({
    action: 'entitlement_revoked',
    actorUserId: input.adminUserId ?? null,
    description: `Entitlement revoked: ${row.code}`,
    metadata: { candidateId: input.candidateId, entitlementCode: row.code },
  });

  return true;
}

/**
 * Expires subscriptions whose period has ended and revokes their entitlements.
 * Intended for a scheduled job in Part 3.
 */
export async function expireLapsedSubscriptions(now: Date = new Date()): Promise<number> {
  const { db } = dbFromRequest();

  const lapsed = await db
    .select({
      id: candidatePremiumSubscriptions.id,
      candidateId: candidatePremiumSubscriptions.candidateId,
      currentPeriodEnd: candidatePremiumSubscriptions.currentPeriodEnd,
    })
    .from(candidatePremiumSubscriptions)
    .where(
      and(
        eq(candidatePremiumSubscriptions.status, 'active'),
        sql`${candidatePremiumSubscriptions.currentPeriodEnd} IS NOT NULL`,
        sql`${candidatePremiumSubscriptions.currentPeriodEnd} < ${now}`
      )
    )
    .limit(500);

  for (const subscription of lapsed) {
    await db
      .update(candidatePremiumSubscriptions)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(candidatePremiumSubscriptions.id, subscription.id));
    await db
      .update(candidateEntitlements)
      .set({ revokedAt: now })
      .where(
        and(
          eq(candidateEntitlements.candidateId, subscription.candidateId),
          eq(candidateEntitlements.subscriptionId, subscription.id),
          isNull(candidateEntitlements.revokedAt)
        )
      );
  }

  return lapsed.length;
}

/** Current subscription state for a candidate. */
export async function getCandidateSubscription(candidateId: string): Promise<{
  id: string;
  planCode: string;
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null> {
  const { db } = dbFromRequest();

  const [row] = await db
    .select({
      id: candidatePremiumSubscriptions.id,
      planCode: candidatePremiumPlans.code,
      planName: candidatePremiumPlans.name,
      status: candidatePremiumSubscriptions.status,
      currentPeriodEnd: candidatePremiumSubscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: candidatePremiumSubscriptions.cancelAtPeriodEnd,
    })
    .from(candidatePremiumSubscriptions)
    .innerJoin(
      candidatePremiumPlans,
      eq(candidatePremiumSubscriptions.planId, candidatePremiumPlans.id)
    )
    .where(eq(candidatePremiumSubscriptions.candidateId, candidateId))
    .orderBy(desc(candidatePremiumSubscriptions.createdAt))
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
  };
}


/**
 * Admin: creates a premium plan.
 *
 * Prices live ONLY here, on a database row. Nothing in the request path or the
 * client bundle contains a price, so commercial terms can change without a
 * deploy and cannot be tampered with in the browser.
 */
export async function createPremiumPlan(input: {
  code: string;
  name: string;
  description?: string | null;
  priceMinor: number;
  currency?: string;
  billingPeriod: string;
  durationDays: number;
  sortOrder?: number;
  isActive?: boolean;
  adminUserId: string;
}): Promise<CandidatePremiumPlanRow> {
  const { db } = dbFromRequest();
  const code = input.code.trim().toLowerCase();

  if (code.length === 0 || code.length > 40) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Plan code is required.');
  }
  if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'Price must be a non-negative integer in minor units.'
    );
  }
  if (!['monthly', 'quarterly', 'yearly'].includes(input.billingPeriod)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported billing period.');
  }

  const [row] = await db
    .insert(candidatePremiumPlans)
    .values({
      code,
      name: input.name.trim().slice(0, 120),
      description: input.description ?? null,
      priceMinor: input.priceMinor,
      currency: input.currency ?? 'INR',
      billingPeriod: input.billingPeriod,
      durationDays: Math.max(1, Math.floor(input.durationDays)),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning();

  await recordPortalAudit({
    action: 'premium_plan_created',
    actorUserId: input.adminUserId,
    description: `Premium plan created: ${row.code}`,
    metadata: { planId: row.id, code: row.code, priceMinor: row.priceMinor },
  });

  return row;
}

/** Admin: updates a plan. Deactivating stops new purchases immediately. */
export async function updatePremiumPlan(input: {
  planId: string;
  name?: string;
  description?: string | null;
  priceMinor?: number;
  billingPeriod?: string;
  durationDays?: number;
  sortOrder?: number;
  isActive?: boolean;
  adminUserId: string;
}): Promise<CandidatePremiumPlanRow> {
  const { db } = dbFromRequest();

  if (input.priceMinor !== undefined && (!Number.isInteger(input.priceMinor) || input.priceMinor < 0)) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'Price must be a non-negative integer in minor units.'
    );
  }
  if (
    input.billingPeriod !== undefined &&
    !['monthly', 'quarterly', 'yearly'].includes(input.billingPeriod)
  ) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported billing period.');
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 120);
  if (input.description !== undefined) patch.description = input.description;
  if (input.priceMinor !== undefined) patch.priceMinor = input.priceMinor;
  if (input.billingPeriod !== undefined) patch.billingPeriod = input.billingPeriod;
  if (input.durationDays !== undefined) patch.durationDays = Math.max(1, Math.floor(input.durationDays));
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [row] = await db
    .update(candidatePremiumPlans)
    .set(patch)
    .where(eq(candidatePremiumPlans.id, input.planId))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested plan was not found.', 404);

  await recordPortalAudit({
    action: 'premium_plan_updated',
    actorUserId: input.adminUserId,
    description: `Premium plan updated: ${row.code}`,
    metadata: { planId: row.id, isActive: row.isActive, priceMinor: row.priceMinor },
  });

  return row;
}

/** Admin: every plan, including retired ones, with its mapped entitlements. */
export async function listAllPlansForAdmin(): Promise<
  Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    priceMinor: number;
    currency: string;
    billingPeriod: string;
    durationDays: number;
    isActive: boolean;
    sortOrder: number;
    entitlements: Array<{ id: string; code: string; name: string }>;
  }>
> {
  const { db } = dbFromRequest();

  const plans = await db
    .select()
    .from(candidatePremiumPlans)
    .orderBy(candidatePremiumPlans.sortOrder, candidatePremiumPlans.name);

  const mapped = await db
    .select({
      planId: candidatePremiumPlanEntitlements.planId,
      id: premiumEntitlements.id,
      code: premiumEntitlements.code,
      name: premiumEntitlements.name,
    })
    .from(candidatePremiumPlanEntitlements)
    .innerJoin(
      premiumEntitlements,
      eq(candidatePremiumPlanEntitlements.entitlementId, premiumEntitlements.id)
    );

  const byPlan = new Map<string, Array<{ id: string; code: string; name: string }>>();
  for (const row of mapped) {
    const list = byPlan.get(row.planId) ?? [];
    list.push({ id: row.id, code: row.code, name: row.name });
    byPlan.set(row.planId, list);
  }

  return plans.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
    durationDays: plan.durationDays,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    entitlements: byPlan.get(plan.id) ?? [],
  }));
}
