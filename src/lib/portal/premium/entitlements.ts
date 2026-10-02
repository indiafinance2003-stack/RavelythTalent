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

/** Whether the candidate currently holds a specific entitlement. */
export async function hasEntitlement(
  candidateId: string,
  entitlementCode: string,
  now: Date = new Date()
): Promise<boolean> {
  const { db } = dbFromRequest();

  const [row] = await db
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

/**
 * Requires an entitlement, throwing a 403 with the entitlement name.
 * Premium-gated features call this on the server; the client never decides.
 */
export async function requireEntitlement(
  candidateId: string,
  entitlementCode: string
): Promise<void> {
  if (await hasEntitlement(candidateId, entitlementCode)) return;
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

/** One plan by id, reading the authoritative price from the database. */
export async function getPlan(planId: string): Promise<CandidatePremiumPlanRow> {
  const { db } = dbFromRequest();
  const [plan] = await db
    .select()
    .from(candidatePremiumPlans)
    .where(and(eq(candidatePremiumPlans.id, planId), eq(candidatePremiumPlans.isActive, true)))
    .limit(1);
  if (!plan) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested plan was not found.', 404);
  return plan;
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

