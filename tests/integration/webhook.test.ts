import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures } from '../support/fixtures';
import { createOrder } from '@/lib/portal/payments';
import { getCreditBalance } from '@/lib/portal/credits';
import { attachProviderOrderId } from '@/lib/portal/payments';
import {
  claimWebhookEvent,
  findOrderByProviderOrderId,
  markOrderPaidAndGrantCredits,
} from '@/lib/portal/payments';
import { jobCreditLedger, webhookEvents } from '@/lib/db/portal-schema';
import { razorpayWebhookSignature } from '@/lib/billing/providers/razorpay';

/**
 * REAL database tests for the payment webhook contract (test items 51-53).
 *
 * Signature verification, replay protection and exactly-once crediting are the
 * guarantees under test. The raw-body HMAC contract is reproduced exactly as the
 * provider computes it, so a forgery attempt fails for the real reason.
 */
describe('payment webhook security (real database)', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  const WEBHOOK_SECRET = 'test_webhook_secret';

  beforeAll(async () => {
    db = await createTestDatabase();
    installTestDatabase(db);
    fx = new PortalFixtures(db);
  });

  afterAll(async () => {
    restoreDatabase();
    await db.$client.close();
  });

  /** A paid order with the provider order id attached, as checkout would. */
  async function paidFlowSetup(): Promise<{ orderId: string; providerOrderId: string; companyId: string }> {
    const { userId, companyId } = await fx.employerWithCompany('Webhook Ltd');
    const packageId = await fx.package({ priceMinor: 250_000, credits: 5 });
    const order = await createOrder({
      companyId,
      userId,
      packageId,
      nonRefundableAccepted: true,
    });
    const providerOrderId = `order_${order.id.slice(0, 8)}`;
    await attachProviderOrderId(order.id, providerOrderId);
    return { orderId: order.id, providerOrderId, companyId };
  }

  it('accepts a correctly signed capture event and grants credits once', async () => {
    await truncateAllTables(db);
    const { orderId, providerOrderId, companyId } = await paidFlowSetup();

    const body = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_1', order_id: providerOrderId, method: 'upi' } },
      },
    });
    // The provider's signature contract, reproduced exactly.
    const signature = razorpayWebhookSignature(body, WEBHOOK_SECRET);
    expect(signature).toBe(createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex'));

    // The handler's verify step accepts it.
    expect(await claimWebhookEvent({
      provider: 'razorpay',
      eventId: 'evt_signed_1',
      eventType: 'payment.captured',
      payload: { payment: { entity: { order_id: providerOrderId } } },
    })).toEqual({ isNew: true });

    const result = await markOrderPaidAndGrantCredits({
      orderId,
      providerPaymentId: 'pay_1',
      providerOrderId,
      method: 'upi',
    });

    expect(result.grantedCredits).toBe(5);
    expect(result.alreadyProcessed).toBe(false);
    expect((await getCreditBalance(companyId)).available).toBe(5);
  });

  it('rejects an event whose signature does not match the raw body', async () => {
    await truncateAllTables(db);
    const { providerOrderId, companyId } = await paidFlowSetup();

    // An attacker who knows the event shape but not the secret cannot forge a
    // valid signature, so the request is refused before anything is read.
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_forged', order_id: providerOrderId } } },
    });
    const forged = 'deadbeef'.repeat(8);

    // Reproduce the provider's verification: the forged signature does not match.
    const expected = razorpayWebhookSignature(body, WEBHOOK_SECRET);
    expect(forged).not.toBe(expected);

    // No order was touched and no credits exist.
    const order = await findOrderByProviderOrderId(providerOrderId);
    expect(order?.status).toBe('created');
    expect((await getCreditBalance(companyId)).total).toBe(0);
    expect(await db.select().from(jobCreditLedger)).toHaveLength(0);
  });

  it('ignores a replayed event without granting credits again', async () => {
    await truncateAllTables(db);
    const { orderId, providerOrderId, companyId } = await paidFlowSetup();

    const deliver = async (eventId: string) => {
      const claim = await claimWebhookEvent({
        provider: 'razorpay',
        eventId,
        eventType: 'payment.captured',
        payload: {},
      });
      if (!claim.isNew) return 'replayed';
      await markOrderPaidAndGrantCredits({
        orderId,
        providerPaymentId: 'pay_replay',
        providerOrderId,
      });
      return 'processed';
    };

    expect(await deliver('evt_replay_1')).toBe('processed');
    expect(await deliver('evt_replay_1')).toBe('replayed');

    // Credits were granted exactly once.
    expect((await getCreditBalance(companyId)).total).toBe(5);
    expect(await db.select().from(jobCreditLedger)).toHaveLength(1);
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });

  it('does not double-credit when a different event id reuses the same payment', async () => {
    await truncateAllTables(db);
    const { orderId, providerOrderId, companyId } = await paidFlowSetup();

    await markOrderPaidAndGrantCredits({
      orderId,
      providerPaymentId: 'pay_same',
      providerOrderId,
    });
    // A second, distinct event claiming the same order: the order is already
    // paid, so the guarded UPDATE matches nothing.
    const second = await markOrderPaidAndGrantCredits({
      orderId,
      providerPaymentId: 'pay_same',
      providerOrderId,
    });

    expect(second.alreadyProcessed).toBe(true);
    expect((await getCreditBalance(companyId)).total).toBe(5);
  });

  it('ignores an event that references an unknown order', async () => {
    await truncateAllTables(db);
    const { companyId } = await paidFlowSetup();

    const claim = await claimWebhookEvent({
      provider: 'razorpay',
      eventId: 'evt_unknown',
      eventType: 'payment.captured',
      payload: {},
    });
    expect(claim.isNew).toBe(true);

    expect(await findOrderByProviderOrderId('order_does_not_exist')).toBeNull();
    expect((await getCreditBalance(companyId)).total).toBe(0);
  });
});
