import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures, expectUniqueViolation } from '../support/fixtures';
import {
  claimWebhookEvent,
  completeWebhookEvent,
  createOrder,
  markOrderPaidAndGrantCredits,
} from '@/lib/portal/payments';
import { consumeCreditForJob, getCreditBalance } from '@/lib/portal/credits';
import { jobCreditLedger, orders } from '@/lib/db/portal-schema';
import { eq } from 'drizzle-orm';

/**
 * REAL database tests for the payment -> credit workflow (test items 47-55).
 *
 * These exercise the actual services against PostgreSQL, because the guarantees
 * under test (exactly-once crediting, replay safety, race-safe consumption) are
 * enforced by database indexes and transactions rather than by application code
 * alone, so a mocked database would not prove anything.
 */
describe('orders and job credits (real transactions)', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  beforeAll(async () => {
    db = await createTestDatabase();
    // Point the real services at this database so they run unmodified.
    installTestDatabase(db);
    fx = new PortalFixtures(db);
  });

  afterAll(async () => {
    restoreDatabase();
    await db.$client.close();
  });

  async function setup(): Promise<{ companyId: string; userId: string; packageId: string }> {
    await truncateAllTables(db);
    const { userId, companyId } = await fx.employerWithCompany('Payer Ltd');
    const packageId = await fx.package({ priceMinor: 250_000, credits: 5, validityDays: 90 });
    return { companyId, userId, packageId };
  }

  it('creates an order priced from the database, not the caller', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({
      companyId,
      userId,
      packageId,
      nonRefundableAccepted: true,
    });

    expect(order.amountMinor).toBe(250_000);
    expect(order.status).toBe('created');
    expect(order.orderNumber).toMatch(/^RVLY-/);
    expect(order.nonRefundableAccepted).toBe(true);
  });

  it('rejects an unknown or inactive package', async () => {
    const { companyId, userId } = await setup();
    await expect(
      createOrder({
        companyId,
        userId,
        packageId: '00000000-0000-0000-0000-000000000000',
        nonRefundableAccepted: true,
      })
    ).rejects.toThrowError(/not found/i);

    const inactive = await fx.package({ status: 'inactive' });
    await expect(
      createOrder({ companyId, userId, packageId: inactive, nonRefundableAccepted: true })
    ).rejects.toThrowError(/not found/i);
  });

  it('grants credits exactly once when a payment is verified', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });

    const result = await markOrderPaidAndGrantCredits({
      orderId: order.id,
      providerPaymentId: 'pay_first_1',
      providerOrderId: 'order_abc',
    });

    expect(result.grantedCredits).toBe(5);
    expect(result.alreadyProcessed).toBe(false);

    const balance = await getCreditBalance(companyId);
    expect(balance.total).toBe(5);
    expect(balance.available).toBe(5);
    expect(balance.used).toBe(0);
  });

  it('does not grant credits a second time for the same order', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });

    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_1' });
    // A redelivery for the same order must be a complete no-op.
    const replay = await markOrderPaidAndGrantCredits({
      orderId: order.id,
      providerPaymentId: 'pay_1',
    });

    expect(replay.grantedCredits).toBe(0);
    expect(replay.alreadyProcessed).toBe(true);
    expect((await getCreditBalance(companyId)).total).toBe(5);
    expect(await db.select().from(jobCreditLedger)).toHaveLength(1);
  });

  it('refuses to grant credits for an unpaid order (no browser-only success)', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });

    // The order is merely 'created': nothing may have been credited yet.
    expect(order.status).toBe('created');
    expect((await getCreditBalance(companyId)).total).toBe(0);
    expect(await db.select().from(jobCreditLedger)).toHaveLength(0);
  });

  it('consumes a credit when a job is posted', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_job_1' });

    const jobId = await fx.job({ companyId });
    const ledgerRow = await consumeCreditForJob({ companyId, jobId });
    expect(ledgerRow.amount).toBe(-1);

    const balance = await getCreditBalance(companyId);
    expect(balance.total).toBe(5);
    expect(balance.used).toBe(1);
    expect(balance.available).toBe(4);
  });

  it('prevents the same job from consuming two credits', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_dup_job' });

    const jobId = await fx.job({ companyId });
    await consumeCreditForJob({ companyId, jobId });

    await expect(consumeCreditForJob({ companyId, jobId })).rejects.toThrowError(
      /already been used/i
    );
    expect((await getCreditBalance(companyId)).used).toBe(1);
  });

  it('blocks posting when the company has no credits and writes nothing', async () => {
    const { companyId } = await setup();
    const jobId = await fx.job({ companyId });

    await expect(consumeCreditForJob({ companyId, jobId })).rejects.toThrowError(
      /do not have any job credits/i
    );
    expect(await db.select().from(jobCreditLedger)).toHaveLength(0);
  });

  it('lets two different jobs each consume a credit from the same balance', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_two_jobs' });

    await consumeCreditForJob({ companyId, jobId: await fx.job({ companyId }) });
    await consumeCreditForJob({ companyId, jobId: await fx.job({ companyId }) });

    const balance = await getCreditBalance(companyId);
    expect(balance.used).toBe(2);
    expect(balance.available).toBe(3);
  });

  it('runs concurrent consumption of the SAME job exactly once', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_race' });

    const jobId = await fx.job({ companyId });

    // Both attempts race. The unique index on job_id means only one can win,
    // whichever order they arrive in.
    const attempts = await Promise.allSettled([
      consumeCreditForJob({ companyId, jobId }),
      consumeCreditForJob({ companyId, jobId }),
    ]);

    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect((await getCreditBalance(companyId)).used).toBe(1);
  });

  it('runs concurrent consumption of DIFFERENT jobs without overspending', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_five' });

    const jobIds = await Promise.all([
      fx.job({ companyId }),
      fx.job({ companyId }),
      fx.job({ companyId }),
    ]);

    const results = await Promise.allSettled(
      jobIds.map((jobId) => consumeCreditForJob({ companyId, jobId }))
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect((await getCreditBalance(companyId)).available).toBe(2);
  });

  it('does not oversubscribe when the last credit is raced for by different jobs', async () => {
    await truncateAllTables(db);
    const { companyId, userId } = await fx.employerWithCompany('One Credit Ltd');

    // Exactly ONE credit. Two different jobs then race for it, so the job-scoped
    // lock alone cannot serialise them: each locks a different jobs row.
    await db.insert(jobCreditLedger).values({
      companyId,
      amount: 1,
      reason: 'admin_adjustment',
      notes: 'seed single credit',
    });

    const jobIds = await Promise.all([fx.job({ companyId }), fx.job({ companyId })]);

    const results = await Promise.allSettled(
      jobIds.map((jobId) => consumeCreditForJob({ companyId, jobId, actorUserId: userId }))
    );

    // The balance must never go negative, and only one job may take the credit.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getCreditBalance(companyId)).available).toBe(0);

    const consumed = await db
      .select()
      .from(jobCreditLedger)
      .where(eq(jobCreditLedger.reason, 'job_post'));
    expect(consumed).toHaveLength(1);
  });

  it('makes webhook processing replay-safe', async () => {
    await truncateAllTables(db);

    const first = await claimWebhookEvent({
      provider: 'razorpay',
      eventId: 'evt_1',
      eventType: 'payment.captured',
    });
    expect(first.isNew).toBe(true);

    // Until the work is committed the lease is re-armed, so a crash cannot
    // strand a captured payment.
    expect(
      (await claimWebhookEvent({
        provider: 'razorpay',
        eventId: 'evt_1',
        eventType: 'payment.captured',
      })).isNew
    ).toBe(true);

    // Once completed, redelivery is recognised as a replay.
    await completeWebhookEvent('evt_1');
    const replay = await claimWebhookEvent({
      provider: 'razorpay',
      eventId: 'evt_1',
      eventType: 'payment.captured',
    });
    expect(replay.isNew).toBe(false);

    // A genuinely different event is still accepted.
    const other = await claimWebhookEvent({
      provider: 'razorpay',
      eventId: 'evt_2',
      eventType: 'payment.captured',
    });
    expect(other.isNew).toBe(true);
  });

  it('does not double-credit when the same webhook event is handled twice', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });

    // Mirrors the real webhook route: claim the event, act only when new, and
    // mark it complete once the side effects have committed.
    const handle = async (eventId: string): Promise<void> => {
      const claim = await claimWebhookEvent({
        provider: 'razorpay',
        eventId,
        eventType: 'payment.captured',
      });
      if (!claim.isNew) return; // replay: no side effects at all
      await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_hook_1' });
      await completeWebhookEvent(eventId);
    };

    await handle('evt_capture_1');
    await handle('evt_capture_1');

    expect((await getCreditBalance(companyId)).total).toBe(5);
    expect(await db.select().from(jobCreditLedger)).toHaveLength(1);
  });

  it('keeps the order paid and records exactly one payment row', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_final_1' });

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe('paid');
    expect(row.paidAt).not.toBeNull();

    // A different payment id for an already-paid order is ignored outright.
    const again = await markOrderPaidAndGrantCredits({
      orderId: order.id,
      providerPaymentId: 'pay_final_2',
    });
    expect(again.alreadyProcessed).toBe(true);
    expect(await db.select().from(jobCreditLedger)).toHaveLength(1);
  });

  it('rejects a duplicate ledger grant for the same order at the database level', async () => {
    const { companyId, userId, packageId } = await setup();
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_unique_grant' });

    await expectUniqueViolation(
      db.insert(jobCreditLedger).values({
        companyId,
        amount: 5,
        reason: 'order',
        orderId: order.id,
      })
    );
  });
});

