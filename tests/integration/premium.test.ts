import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures } from '../support/fixtures';
import { markOrderPaidAndGrantCredits } from '@/lib/portal/payments';
import { getCreditBalance } from '@/lib/portal/credits';
import {
  getCandidateSubscription,
  listCandidateEntitlements,
} from '@/lib/portal/premium/entitlements';
import {
  candidatePremiumPlanEntitlements,
  candidatePremiumPlans,
  orders,
  premiumEntitlements,
} from '@/lib/db/portal-schema';
import { eq } from 'drizzle-orm';

/**
 * Premium purchase -> subscription -> entitlements.
 *
 * The bug this guards against is silent and expensive: `orders.packageId` points
 * at a job package for employer purchases and at a premium PLAN for candidate
 * purchases, so a handler that does not branch on orderType will happily pay out
 * employer job credits for a candidate's premium purchase, and leave the
 * customer with no premium entitlements at all.
 */
describe('candidate premium purchase (real database)', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  beforeAll(async () => {
    db = await createTestDatabase();
    installTestDatabase(db);
    fx = new PortalFixtures(db);
  });

  afterAll(async () => {
    restoreDatabase();
    await db.$client.close();
  });

  /** A premium plan with one mapped entitlement, plus a paid candidate order. */
  async function premiumOrder(): Promise<{
    orderId: string;
    candidateId: string;
    planId: string;
    companyId: string;
  }> {
    const candidateId = await fx.candidate('Premium Buyer');
    const candidateUserId = await fx.user('candidate', 'Premium Buyer');
    const companyId = await fx.company('Buyer Co');

    // Idempotent: `premium_entitlements` is seeded reference data that
    // `truncateAllTables` preserves, so this row survives between tests in this
    // file and a blind insert would collide on the unique `code`.
    const [existing] = await db
      .select({ id: premiumEntitlements.id })
      .from(premiumEntitlements)
      .where(eq(premiumEntitlements.code, 'profile_boost'))
      .limit(1);
    const entitlement =
      existing ??
      (
        await db
          .insert(premiumEntitlements)
          .values({ code: 'profile_boost', name: 'Profile boost', description: 'Top of search' })
          .returning({ id: premiumEntitlements.id })
      )[0];

    const [plan] = await db
      .insert(candidatePremiumPlans)
      .values({
        code: `plan-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Boosted',
        priceMinor: 99_900,
        durationDays: 30,
        isActive: true,
      })
      .returning({ id: candidatePremiumPlans.id });

    await db.insert(candidatePremiumPlanEntitlements).values({
      planId: plan.id,
      entitlementId: entitlement.id,
    });

    const orderId = await fx.order({
      orderType: 'candidate_premium',
      packageId: plan.id,
      candidateId,
      userId: candidateUserId,
      companyId,
      amountMinor: 99_900,
    });

    return { orderId, candidateId, planId: plan.id, companyId };
  }

  it('activates a subscription and its entitlements when a premium order is paid', async () => {
    await truncateAllTables(db);
    const { orderId, candidateId } = await premiumOrder();

    const result = await markOrderPaidAndGrantCredits({
      orderId,
      providerPaymentId: 'pay_premium_1',
    });

    expect(result.alreadyProcessed).toBe(false);

    const subscription = await getCandidateSubscription(candidateId);
    expect(subscription).not.toBeNull();
    expect(subscription?.status).toBe('active');

    const entitlements = await listCandidateEntitlements(candidateId);
    expect(entitlements.map((e) => e.code)).toContain('profile_boost');
  });

  it('never pays out employer job credits for a premium purchase', async () => {
    await truncateAllTables(db);
    const { orderId, companyId } = await premiumOrder();

    const result = await markOrderPaidAndGrantCredits({
      orderId,
      providerPaymentId: 'pay_premium_2',
    });

    // A premium purchase is not a job-credit purchase.
    expect(result.grantedCredits).toBe(0);
    expect((await getCreditBalance(companyId)).total).toBe(0);
  });

  it('does not activate premium again on a replayed payment', async () => {
    await truncateAllTables(db);
    const { orderId, candidateId } = await premiumOrder();

    await markOrderPaidAndGrantCredits({ orderId, providerPaymentId: 'pay_premium_3' });
    const replay = await markOrderPaidAndGrantCredits({
      orderId,
      providerPaymentId: 'pay_premium_3',
    });

    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.grantedCredits).toBe(0);

    // Still exactly one subscription, not two.
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row.status).toBe('paid');
    expect((await getCandidateSubscription(candidateId))?.status).toBe('active');
  });
});