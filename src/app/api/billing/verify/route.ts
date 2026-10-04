import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { assertSameOrigin } from "@/lib/security";
import { handleApi, jsonOk, readJson } from "@/lib/http";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { verifyCheckoutSignature } from "@/lib/billing/razorpay";
import { activateSubscription } from "@/lib/billing/activate";
import { activateAddonPayment } from "@/lib/billing/addons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  razorpay_order_id: z.string().min(4).max(100),
  razorpay_payment_id: z.string().min(4).max(100),
  razorpay_signature: z.string().min(16).max(256),
});

/**
 * POST /api/billing/verify
 *
 * Verifies the checkout signature and activates the plan. The webhook can also
 * activate the same order, so this path is idempotent too - whichever arrives
 * first wins and the other becomes a no-op.
 */
export const POST = handleApi(async (request: Request) => {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();

  const body = bodySchema.parse(await readJson(request));

  const valid = verifyCheckoutSignature({
    razorpayOrderId: body.razorpay_order_id,
    razorpayPaymentId: body.razorpay_payment_id,
    razorpaySignature: body.razorpay_signature,
  });
  if (!valid) {
    throw new AppError("Payment verification failed.", 400, "invalid_signature");
  }

  const payment = (
    await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, body.razorpay_order_id))
      .limit(1)
  ).at(0);

  if (!payment || payment.userId !== user.id) {
    throw new AppError("Order not found.", 404, "order_not_found");
  }
  if (payment.purpose === "addon") {
    const result = await activateAddonPayment({
      orderId: payment.orderId,
      paymentId: body.razorpay_payment_id,
      amountPaise: payment.amountPaise,
      signatureVerified: true,
    });
    return jsonOk({
      verified: true,
      alreadyProcessed: result.alreadyProcessed,
      purchaseId: result.purchaseId,
    });
  }
  if (!payment.planId) {
    throw new AppError("Order has no plan attached.", 400, "order_without_plan");
  }

  const notes = (JSON.parse(payment.notes ?? "{}") ?? {}) as {
    planCode?: string;
    billingPeriod?: "monthly" | "yearly";
  };
  const billingPeriod = notes.billingPeriod === "yearly" ? "yearly" : "monthly";

  const result = await activateSubscription({
    orderId: payment.orderId,
    paymentId: body.razorpay_payment_id,
    amountPaise: payment.amountPaise,
    userId: payment.userId,
    companyId: payment.companyId,
    planId: payment.planId,
    billingPeriod,
    signatureVerified: true,
  });

  return jsonOk({
    verified: true,
    alreadyProcessed: result.alreadyProcessed,
    subscriptionId: result.subscriptionId,
    invoiceId: result.invoiceId,
  });
});
