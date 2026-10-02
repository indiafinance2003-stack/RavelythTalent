import { NextRequest, NextResponse } from 'next/server';
import {
  BillingWebhookSignatureError,
  getBillingProvider,
} from '@/lib/billing/providers';
import {
  claimWebhookEvent,
  completeWebhookEvent,
  findOrderByProviderOrderId,
  markOrderPaidAndGrantCredits,
  markWebhookFailed,
} from '@/lib/portal/payments';
import { logger } from '@/lib/logging/logger';

/**
 * Ravelyth Talent payment webhook.
 *
 * This is the ONLY path that can turn an order into job credits, and it is
 * built so a forged or replayed delivery cannot do damage:
 *
 *  1. SIGNATURE FIRST. The raw body is verified against the gateway webhook
 *     secret BEFORE the payload is parsed. A missing or bad signature is
 *     rejected with 400 and nothing is read from the body.
 *  2. IDEMPOTENT. Every event id is claimed under a unique index. A redelivery
 *     fails that insert and is acknowledged with 200 having done NOTHING, so
 *     the gateway stops retrying without the platform granting credits twice.
 *  3. SERVER-AUTHORITATIVE. The order is located by the PROVIDER's own order id
 *     and the amount credited comes from the stored order, never from the event.
 *  4. ATOMIC. Marking the order paid and granting credits happen in one
 *     transaction, guarded so a replay is a no-op.
 *
 * A client claiming "payment succeeded" has no effect anywhere in this codebase.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const provider = getBillingProvider();
  if (!provider) {
    // An operator setup problem, not a gateway fault: acknowledge it rather
    // than triggering endless retries, but keep it visible in the log.
    logger.error('Payment webhook received but no provider is configured');
    return NextResponse.json(
      { success: false, error: 'Payments are not configured' },
      { status: 503 }
    );
  }

  // The RAW body is required: re-serialising parsed JSON would change the bytes
  // and invalidate the signature.
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  let event: { event: string; payload: Record<string, unknown> };
  try {
    event = await provider.verifyWebhook(rawBody, signature);
  } catch (error) {
    if (error instanceof BillingWebhookSignatureError) {
      // A bad signature is a probable forgery: log it, change nothing.
      logger.warn('Rejected payment webhook with an invalid signature');
      return NextResponse.json({ success: false }, { status: 400 });
    }
    logger.error('Payment webhook verification failed');
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const eventId = extractEventId(event.payload);
  if (!eventId) {
    logger.warn('Payment webhook had no event id', { event: event.event });
    return NextResponse.json({ success: false }, { status: 400 });
  }

  // Claim the event BEFORE acting, so two concurrent deliveries cannot both
  // proceed.
  const claim = await claimWebhookEvent({
    provider: 'razorpay',
    eventId,
    eventType: event.event,
    payload: event.payload,
  });

  if (!claim.isNew) {
    // Already handled: acknowledge so the gateway stops retrying.
    logger.info('Ignored replayed payment webhook', { eventId, event: event.event });
    return NextResponse.json({ success: true, duplicate: true });
  }

  try {
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const providerOrderId = extractProviderOrderId(event.payload);
      if (!providerOrderId) {
        await markWebhookFailed(eventId, 'missing order id');
        return NextResponse.json({ success: false }, { status: 400 });
      }

      // The order is located by the PROVIDER's id, never by a client value.
      const order = await findOrderByProviderOrderId(providerOrderId);
      if (!order) {
        logger.warn('Payment webhook referenced an unknown order', { eventId, providerOrderId });
        // Nothing to apply, but the attempt itself succeeded: do not retry forever.
        await completeWebhookEvent(eventId);
        return NextResponse.json({ success: true });
      }

      const result = await markOrderPaidAndGrantCredits({
        orderId: order.id,
        providerPaymentId: extractPaymentId(event.payload) ?? `${eventId}-payment`,
        providerOrderId,
        method: extractMethod(event.payload),
      });

      logger.info('Payment webhook processed', {
        eventId,
        orderId: order.id,
        alreadyProcessed: result.alreadyProcessed,
        grantedCredits: result.grantedCredits,
      });
    }

    // Marked done ONLY now, after the side effects have committed. A crash
    // before this point leaves the event retryable rather than silently lost.
    await completeWebhookEvent(eventId);

    // Unknown event types are acknowledged with no side effects.
    return NextResponse.json({ success: true });
  } catch (error) {
    await markWebhookFailed(eventId, error instanceof Error ? error.message : 'unknown error');
    logger.error('Payment webhook processing failed', {
      eventId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

/** Reads the event id from the payload, or null when absent. */
function extractEventId(payload: Record<string, unknown>): string | null {
  const value = payload.event_id ?? payload.id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Reads the provider order id from the payment or order entity. */
function extractProviderOrderId(payload: Record<string, unknown>): string | null {
  const paymentEntity = (payload.payment as { entity?: { order_id?: unknown } } | undefined)
    ?.entity;
  if (paymentEntity && typeof paymentEntity.order_id === 'string') return paymentEntity.order_id;

  const orderEntity = (payload.order as { entity?: { id?: unknown } } | undefined)?.entity;
  if (orderEntity && typeof orderEntity.id === 'string') return orderEntity.id;

  return null;
}

/** Reads the provider payment id, when the event carries one. */
function extractPaymentId(payload: Record<string, unknown>): string | null {
  const entity = (payload.payment as { entity?: { id?: unknown } } | undefined)?.entity;
  return entity && typeof entity.id === 'string' ? entity.id : null;
}

/** Reads the payment method, for the employer's receipt. */
function extractMethod(payload: Record<string, unknown>): string | null {
  const entity = (payload.payment as { entity?: { method?: unknown } } | undefined)?.entity;
  return entity && typeof entity.method === 'string' ? entity.method : null;
}

