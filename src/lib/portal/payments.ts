import 'server-only';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  jobPackages,
  orders,
  payments,
  webhookEvents,
  type OrderRow,
  type OrderStatus,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import { grantCreditsForOrder } from '@/lib/portal/credits';

/**
 * Orders and payments (see §14).
 *
 * Security model — the parts the brief calls out as critical:
 *
 *  1. THE PRICE IS NEVER TAKEN FROM THE CLIENT. `createOrder` reads
 *     `job_packages.price_minor` from the database and copies it into the
 *     order. Any amount in the request body is ignored entirely.
 *  2. BROWSER SUCCESS IS NEVER TRUSTED. A payment only becomes 'paid' through
 *     `markOrderPaidAndGrantCredits`, which is called only after a server-side
 *     signature verification or a signed webhook. No endpoint marks an order
 *     paid on a client claim.
 *  3. WEBHOOKS ARE IDEMPOTENT AND REPLAY-SAFE. Every event is recorded under a
 *     unique (provider, event_id). A redelivery fails that insert, is
 *     acknowledged as already-processed, and performs no side effects.
 *  4. CREDIT ALLOCATION HAPPENS EXACTLY ONCE. Payment confirmation and the
 *     credit grant run in one transaction, and the ledger's unique index on
 *     order_id is the final backstop.
 *  5. NO SENSITIVE PAYMENT DATA IS STORED. Only provider references, the quoted
 *     amount and a status are persisted. No card numbers, no CVV, no secrets.
 */

/** Order number that is unique and not guessable in bulk. */
function generateOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');
  return `RVLY-${stamp}-${random}`;
}

/**
 * Creates a pending order for a job package.
 *
 * The amount is copied from the authoritative package row; the caller cannot
 * influence it. `companyId` must come from the authenticated employer session.
 */
export async function createOrder(input: {
  companyId: string;
  userId: string;
  packageId: string;
  /** Acceptance of the non-refundable terms for paid job packages. */
  nonRefundableAccepted: boolean;
}): Promise<OrderRow> {
  const { db } = dbFromRequest();

  const [pkg] = await db
    .select()
    .from(jobPackages)
    .where(and(eq(jobPackages.id, input.packageId), eq(jobPackages.status, 'active')))
    .limit(1);

  if (!pkg) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested package was not found.', 404);
  }

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: generateOrderNumber(),
      companyId: input.companyId,
      userId: input.userId,
      packageId: pkg.id,
      orderType: 'job_package',
      // Authoritative, server-side price. Never the request body.
      amountMinor: pkg.priceMinor,
      currency: pkg.currency,
      status: 'created',
      nonRefundableAccepted: input.nonRefundableAccepted,
    })
    .returning();

  await recordPortalAudit({
    action: 'order_created',
    actorUserId: input.userId,
    description: `Order ${order.orderNumber} created for package ${pkg.code}`,
    metadata: { orderId: order.id, packageId: pkg.id, amountMinor: pkg.priceMinor },
  });

  return order;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  packageId: string;
  amountMinor: number;
  currency: string;
  status: OrderStatus;
  paidAt: string | null;
  createdAt: string;
  /** Whether the employer accepted the non-refundable terms. */
  nonRefundableAccepted: boolean;
}

function toOrderDTO(row: OrderRow): OrderDTO {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    packageId: row.packageId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status as OrderStatus,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    nonRefundableAccepted: row.nonRefundableAccepted,
  };
}

/** One order, scoped to the caller's own company. */
export async function getOrderForCompany(orderId: string, companyId: string): Promise<OrderDTO> {
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))
    .limit(1);
  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested order was not found.', 404);
  return toOrderDTO(row);
}

/** Orders for one company, newest first. */
export async function listCompanyOrders(
  companyId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<OrderDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.companyId, companyId))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0));
  return rows.map(toOrderDTO);
}

/** Any order by its provider order id (server-side only). */
export async function findOrderByProviderOrderId(
  providerOrderId: string
): Promise<OrderRow | null> {
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(orders)
    .where(eq(orders.providerOrderId, providerOrderId))
    .limit(1);
  return row ?? null;
}

export async function attachProviderOrderId(
  orderId: string,
  providerOrderId: string
): Promise<void> {
  const { db } = dbFromRequest();
  await db
    .update(orders)
    .set({ providerOrderId, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'created')));
}

export async function markOrderFailed(orderId: string): Promise<void> {
  const { db } = dbFromRequest();
  await db
    .update(orders)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'created')));
  await recordPortalAudit({
    action: 'payment_status_changed',
    description: 'Order payment failed',
    metadata: { orderId, status: 'failed' },
  });
}

/**
 * Marks an order paid and grants its credits - atomically and exactly once.
 *
 * Idempotency comes from three independent guards:
 *  - the order UPDATE is guarded on `status = 'created'`, so a replay matches
 *    zero rows and skips both the credit grant and the notification;
 *  - `payments.provider_payment_id` is uniquely indexed, so one provider
 *    payment can never be recorded twice;
 *  - the credit ledger is unique per order, so even a manually retried grant is
 *    rejected by the database.
 *
 * Returns the granted credit count, or 0 when this was a duplicate delivery.
 */
export async function markOrderPaidAndGrantCredits(input: {
  orderId: string;
  providerPaymentId: string;
  providerOrderId?: string | null;
  method?: string | null;
  now?: Date;
}): Promise<{ grantedCredits: number; alreadyProcessed: boolean }> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'The requested order was not found.', 404);
    }

    // Guard 1: the order must still be awaiting payment.
    const [claimed] = await tx
      .update(orders)
      .set({ status: 'paid', paidAt: now, updatedAt: now })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'created')))
      .returning();

    if (!claimed) {
      // Already paid (or cancelled): this is a replay. No side effects.
      return { grantedCredits: 0, alreadyProcessed: true };
    }

    // Guard 2: one provider payment maps to exactly one payment row.
    await tx.insert(payments).values({
      orderId: input.orderId,
      status: 'captured',
      amountMinor: order.amountMinor,
      currency: order.currency,
      providerOrderId: input.providerOrderId ?? order.providerOrderId ?? null,
      providerPaymentId: input.providerPaymentId,
      method: input.method ?? null,
      authorizedAt: now,
      capturedAt: now,
    });

    const [pkg] = await tx
      .select()
      .from(jobPackages)
      .where(eq(jobPackages.id, order.packageId))
      .limit(1);

    // Guard 3: the ledger is unique per order (enforced by a DB index).
    await grantCreditsForOrder(input.orderId);

    await recordPortalAudit({
      action: 'payment_status_changed',
      description: `Order ${order.orderNumber} marked paid`,
      metadata: {
        orderId: input.orderId,
        providerPaymentId: input.providerPaymentId,
        amountMinor: order.amountMinor,
        credits: pkg?.credits ?? 0,
      },
    });

    return { grantedCredits: pkg?.credits ?? 0, alreadyProcessed: false };
  });
}

/**
 * Records a webhook event and reports whether it is new.
 *
 * Returns false when the event was already recorded, which is how a replayed
 * delivery is stopped from having any effect.
 */
export async function claimWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<{ isNew: boolean }> {
  const { db } = dbFromRequest();

  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      eventType: input.eventType,
      status: 'processed',
      // Stored for troubleshooting only; never returned to a client and never
      // contains credentials.
      payloadJson: input.payload ?? {},
      processedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  return { isNew: inserted.length > 0 };
}

/** Marks a webhook event as failed so it can be investigated. */
export async function markWebhookFailed(eventId: string, error: string): Promise<void> {
  const { db } = dbFromRequest();
  await db
    .update(webhookEvents)
    .set({ status: 'failed', error: error.slice(0, 500) })
    .where(eq(webhookEvents.eventId, eventId));
}

/** Expiry sweep for abandoned orders. Intended for a scheduled job. */
export async function expireStaleOrders(olderThanHours = 24): Promise<number> {
  const { db } = dbFromRequest();
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const updated = await db
    .update(orders)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(sql`${orders.status} = 'created'`, lt(orders.createdAt, cutoff)))
    .returning({ id: orders.id });
  return updated.length;
}
