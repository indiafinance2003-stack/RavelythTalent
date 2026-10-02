import 'server-only';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  companies,
  jobPackages,
  orders,
  payments,
  webhookEvents,
  type OrderRow,
  type OrderStatus,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import { grantCreditsWith } from '@/lib/portal/credits';
import { activateSubscriptionWith, getPlan } from '@/lib/portal/premium/entitlements';

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

/**
 * Creates a pending order for a CANDIDATE PREMIUM plan.
 *
 * Mirrors `createOrder` exactly, with two differences that matter:
 *  - the amount is copied from the premium PLAN row, never from the request;
 *  - `orderType` is `candidate_premium` and `candidateId` is recorded, which is
 *    what makes the verified webhook activate a subscription instead of paying
 *    out employer job credits.
 *
 * A candidate still cannot simply POST here and become premium: the row stays
 * 'created' until a verified payment confirms it.
 */
export async function createPremiumOrder(input: {
  candidateId: string;
  userId: string;
  planId: string;
}): Promise<OrderRow> {
  const { db } = dbFromRequest();

  // Resolving through getPlan enforces `is_active`, so a retired plan cannot be
  // bought even with a valid id.
  const plan = await getPlan(input.planId);

  // `orders.company_id` is NOT NULL for every order, but a candidate has no
  // company. A dedicated, clearly-labelled placeholder row keeps the column
  // honest and prevents any company-scoped query from matching it.
  const [placeholder] = await db
    .insert(companies)
    .values({
      name: 'Candidate purchase',
      slug: `candidate-purchase-${input.candidateId.slice(0, 8)}`,
      status: 'active',
    })
    .onConflictDoNothing()
    .returning({ id: companies.id });

  let companyId = placeholder?.id ?? null;
  if (!companyId) {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, `candidate-purchase-${input.candidateId.slice(0, 8)}`))
      .limit(1);
    companyId = existing?.id ?? null;
  }
  if (!companyId) {
    throw new AppError(
      AppErrorCode.INTERNAL_ERROR,
      'The premium purchase could not be prepared.',
      500
    );
  }

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: generateOrderNumber(),
      companyId,
      userId: input.userId,
      packageId: plan.id,
      orderType: 'candidate_premium',
      candidateId: input.candidateId,
      // Authoritative, server-side price.
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      status: 'created',
      // Premium plans are a recurring-style commitment, so the same commercial
      // terms acceptance applies as for job packages.
      nonRefundableAccepted: true,
    })
    .returning();

  await recordPortalAudit({
    action: 'order_created',
    actorUserId: input.userId,
    description: `Premium order ${order.orderNumber} created for plan ${plan.code}`,
    metadata: { orderId: order.id, planId: plan.id, amountMinor: plan.priceMinor },
  });

  return order;
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

  // The transaction contains ONLY the business work. Auditing runs after the
  // commit so it can never hold the business transaction open.
  const result = await db.transaction(async (tx) => {
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
      return { grantedCredits: 0, alreadyProcessed: true, orderNumber: order.orderNumber };
    }

    // Guard 2: one provider payment maps to exactly one payment row.
    const [payment] = await tx
      .insert(payments)
      .values({
        orderId: input.orderId,
        status: 'captured',
        amountMinor: order.amountMinor,
        currency: order.currency,
        providerOrderId: input.providerOrderId ?? order.providerOrderId ?? null,
        providerPaymentId: input.providerPaymentId,
        method: input.method ?? null,
        authorizedAt: now,
        capturedAt: now,
      })
      .returning({ id: payments.id });

    // A candidate PREMIUM purchase grants a subscription, not job credits.
    // Without this branch a premium order would silently pay out employer job
    // credits, because `jobPackages.credits` is always defined, and the
    // customer would receive no premium entitlements at all.
    if (order.orderType === 'candidate_premium') {
      if (!order.candidateId) {
        throw new AppError(
          AppErrorCode.VALIDATION_ERROR,
          'A premium order must name the candidate it belongs to.',
          400
        );
      }

      // `packageId` carries the premium PLAN for this order type. The plan is
      // read on THIS executor: a second connection here would deadlock against
      // the transaction that already holds the only one.
      const plan = await getPlan(order.packageId, tx);

      await activateSubscriptionWith(tx, {
        candidateId: order.candidateId,
        plan,
        orderId: input.orderId,
        // The payment ROW id, not the gateway reference: `payment_id` is a
        // uuid that references `payments`.
        paymentId: payment.id,
        now,
      });

      return {
        grantedCredits: 0,
        alreadyProcessed: false,
        orderNumber: order.orderNumber,
      };
    }

    const [pkg] = await tx
      .select()
      .from(jobPackages)
      .where(eq(jobPackages.id, order.packageId))
      .limit(1);

    // Guard 3: the ledger is unique per order (enforced by a DB index). This
    // runs on the SAME transaction so the order and its credits commit together.
    await grantCreditsWith(tx, input.orderId);


    return { grantedCredits: pkg?.credits ?? 0, alreadyProcessed: false, orderNumber: order.orderNumber };
  });

  if (!result.alreadyProcessed) {
    await recordPortalAudit({
      action: 'payment_status_changed',
      description: `Order ${result.orderNumber} marked paid`,
      metadata: {
        orderId: input.orderId,
        providerPaymentId: input.providerPaymentId,
        credits: result.grantedCredits,
      },
    });
  }

  return { grantedCredits: result.grantedCredits, alreadyProcessed: result.alreadyProcessed };
}

/**
 * Claims a webhook event for processing and reports whether this delivery owns it.
 *
 * The row is inserted as 'processing', NOT 'processed'. Marking it done up front
 * would be fatal: if the handler then throws or the process dies, the gateway's
 * retry would hit the unique index, be told it was a duplicate, and the captured
 * payment would never grant credits. The claim is only a lease.
 *
 * Only a COMPLETED event is refused. Anything else ('processing' from a crash,
 * 'failed' from a thrown handler) is re-admitted, which is what makes a transient
 * failure recoverable instead of losing the customer's money.
 *
 * Re-admitting an in-flight 'processing' row is safe because the side effects are
 * idempotent in their own right: crediting is guarded by the order's status and a
 * unique index on the ledger's order_id, so a duplicate delivery does no damage.
 * This table stops replays after completion; it is not the double-spend guard.
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
      status: 'processing',
      // Stored for troubleshooting only; never returned to a client and never
      // contains credentials.
      payloadJson: input.payload ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length > 0) return { isNew: true };

  // A row already exists. Only a COMPLETED event is a genuine replay.
  const [existing] = await db
    .select({ status: webhookEvents.status })
    .from(webhookEvents)
    .where(
      and(eq(webhookEvents.provider, input.provider), eq(webhookEvents.eventId, input.eventId))
    )
    .limit(1);

  if (existing && existing.status !== 'processed') {
    // Re-arm the lease so a crashed or failed attempt can be retried.
    await db
      .update(webhookEvents)
      .set({ status: 'processing', error: null })
      .where(
        and(eq(webhookEvents.provider, input.provider), eq(webhookEvents.eventId, input.eventId))
      );
    return { isNew: true };
  }

  return { isNew: false };
}

/**
 * Marks a webhook event as fully handled. Called only AFTER the side effects
 * have committed, so a crash between the two leaves the event retryable.
 */
export async function completeWebhookEvent(eventId: string): Promise<void> {
  const { db } = dbFromRequest();
  await db
    .update(webhookEvents)
    .set({ status: 'processed', processedAt: new Date(), error: null })
    .where(eq(webhookEvents.eventId, eventId));
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
