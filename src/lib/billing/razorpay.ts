import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Razorpay Orders integration (NOT the Subscriptions API).
 *
 * Money is handled in paise end to end. The webhook secret is only ever used
 * server-side to verify the raw request body.
 */

let client: Razorpay | null = null;

export function razorpayConfigured(): boolean {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = getEnv();
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

export function publicKeyId(): string {
  const key = getEnv().NEXT_PUBLIC_RAZORPAY_KEY_ID || getEnv().RAZORPAY_KEY_ID;
  if (!key) {
    throw new AppError("Payments are not configured yet.", 503, "payments_unconfigured");
  }
  return key;
}

export function getRazorpay(): Razorpay {
  if (client) return client;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = getEnv();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new AppError("Payments are not configured yet.", 503, "payments_unconfigured");
  }
  client = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  return client;
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const rz = getRazorpay();
  const created = await rz.orders.create({
    amount: params.amountPaise,
    currency: "INR",
    receipt: params.receipt,
    notes: params.notes,
  });

  const order = created as unknown as {
    id: string;
    amount: number;
    currency: string;
  };

  return { id: order.id, amount: order.amount, currency: order.currency };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Checkout signature: HMAC(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const { RAZORPAY_KEY_SECRET } = getEnv();
  if (!RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");
  return safeEqual(expected, params.razorpaySignature);
}

/** Webhook signature: HMAC(rawBody, RAZORPAY_WEBHOOK_SECRET). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const { RAZORPAY_WEBHOOK_SECRET } = getEnv();
  if (!RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Invoice number: RAV/<financial year>/<6-digit sequence>. */
export function financialYear(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return month >= 4 ? `${year}-${(year + 1) % 100}` : `${year - 1}-${year % 100}`;
}
