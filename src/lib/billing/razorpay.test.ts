import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  financialYear,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "./razorpay";

describe("Razorpay signature verification", () => {
  it("validates checkout HMACs and rejects altered or malformed signatures", () => {
    const orderId = "order_local";
    const paymentId = "pay_local";
    const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    expect(verifyCheckoutSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    })).toBe(true);
    expect(verifyCheckoutSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: `${signature}00`,
    })).toBe(false);
  });

  it("validates a webhook signature against the exact raw body", () => {
    const body = '{"event":"payment.captured","id":"evt_local"}';
    const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");
    expect(verifyWebhookSignature(body, signature)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, signature)).toBe(false);
  });

  it("formats Indian financial years at the April India-time boundary", () => {
    expect(financialYear(new Date("2026-03-31T18:29:59.999Z"))).toBe("2025-26");
    expect(financialYear(new Date("2026-03-31T18:30:00.000Z"))).toBe("2026-27");
  });
});
