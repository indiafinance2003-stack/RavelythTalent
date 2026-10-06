import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments, webhookEvents } from "@/lib/db/schema";
import { jsonOk } from "@/lib/http";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { recordFailedPayment } from "@/lib/billing/activate";
import { activateSubscriptionFromPayment } from "@/lib/billing/payment-activation";
import { activateAddonPayment } from "@/lib/billing/addons";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayEvent = {
  id?: string;
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        method?: string;
        notes?: Record<string, string>;
      };
    };
    order?: {
      entity?: { id?: string; notes?: Record<string, string> };
    };
  };
};

/**
 * POST /api/webhooks/razorpay
 *
 * - The signature is verified against the RAW request body and
 *   RAZORPAY_WEBHOOK_SECRET.
 * - Every event id is recorded in `webhook_events` (unique), so replays are
 *   ignored: a payment can never activate twice.
 * - This is the safety net for a browser that closed before calling
 *   /api/billing/verify.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return Response.json(
      { ok: false, error: { code: "invalid_signature", message: "Invalid signature." } },
      { status: 400 },
    );
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    throw new AppError("Invalid JSON body.", 400, "invalid_json");
  }

  const eventId = event.id ?? `${event.event}:${event.payload?.payment?.entity?.id ?? "unknown"}`;

  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: "razorpay",
      eventId,
      eventType: event.event ?? null,
      payload: rawBody.slice(0, 10000),
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (!inserted.at(0)) {
    // Already processed - acknowledge so Razorpay stops retrying.
    return jsonOk({ received: true, duplicate: true });
  }

  try {
    switch (event.event) {
      case "payment.captured":
      case "order.paid":
        await handleCaptured(event);
        break;
      case "payment.failed":
        await handleFailed(event);
        break;
      default:
        break;
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, inserted[0]!.id));
  } catch (error) {
    // Let Razorpay retry: drop the event record so it can be processed again.
    await db
      .delete(webhookEvents)
      .where(eq(webhookEvents.id, inserted.at(0)!.id));
    console.error("[razorpay] webhook processing failed:", error);
    throw new AppError("Webhook processing failed.", 500, "webhook_failed");
  }

  return jsonOk({ received: true });
}

async function handleCaptured(event: RazorpayEvent): Promise<void> {
  const entity = event.payload?.payment?.entity;
  const orderId = entity?.order_id;
  if (!orderId || !entity?.id) return;

  const payment = (
    await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1)
  ).at(0);
  if (!payment) return;

  if (payment.purpose === "addon") {
    if (typeof entity.amount !== "number" || entity.currency !== "INR") {
      throw new AppError("Captured add-on payment has invalid amount or currency.", 400, "invalid_payment");
    }
    await activateAddonPayment({
      orderId,
      paymentId: entity.id,
      amountPaise: entity.amount,
      method: entity.method ?? null,
      signatureVerified: true,
    });
    return;
  }
  if (!payment.planId) return;

  const notes = (entity.notes ?? {}) as {
    planId?: string;
    billingPeriod?: string;
    companyId?: string;
    userId?: string;
  };

  await activateSubscriptionFromPayment({
    orderId,
    paymentId: entity.id,
    amountPaise: entity.amount ?? payment.amountPaise,
    userId: payment.userId,
    companyId: payment.companyId,
    planId: payment.planId,
    billingPeriod: resolveBillingPeriod(notes.billingPeriod, payment.notes),
    method: entity.method ?? null,
  });
}

async function handleFailed(event: RazorpayEvent): Promise<void> {
  const entity = event.payload?.payment?.entity;
  const orderId = entity?.order_id;
  if (!orderId) return;

  const payment = (
    await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1)
  ).at(0);
  if (!payment) return;

  await recordFailedPayment({
    orderId,
    userId: payment.userId,
    amountPaise: payment.amountPaise,
    reason: (entity as { error_description?: string } | undefined)?.error_description ?? null,
  });
}

/**
 * Razorpay copies order notes onto the payment entity, but our own payment
 * row is the source of truth for the billing period chosen at checkout.
 */
function resolveBillingPeriod(
  notesPeriod: string | undefined,
  paymentNotes: string | null,
): "monthly" | "yearly" {
  const stored = (JSON.parse(paymentNotes ?? "{}") ?? {}) as {
    billingPeriod?: string;
  };
  return notesPeriod === "yearly" || stored.billingPeriod === "yearly"
    ? "yearly"
    : "monthly";
}
