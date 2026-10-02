import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { createPremiumOrder } from '@/lib/portal/payments';
import { getBillingProvider, isPaymentConfigured } from '@/lib/billing/providers';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';

const checkoutSchema = z.object({ planId: z.string().uuid() }).strict();

/**
 * POST /api/portal/candidate/premium/checkout
 *
 * Starts a REAL premium purchase: it creates an order whose amount is read from
 * the plan row server-side, then creates the matching order at the payment
 * provider so the browser has something to pay against.
 *
 * It deliberately does NOT activate anything. The order stays `created` until a
 * verified webhook or signature check confirms payment, which is what
 * `markOrderPaidAndGrantCredits` then uses to grant the subscription. There is
 * no "activate premium" call anywhere in the client contract, so a user cannot
 * grant themselves entitlements.
 *
 * Responds honestly when payments are not configured rather than pretending a
 * purchase started.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const profile = await requireCandidateProfile();
      const input = parseWithSchema(checkoutSchema, await readJsonBody(req));

      const provider = getBillingProvider();
      if (!provider || !isPaymentConfigured()) {
        throw new AppError(
          AppErrorCode.PAYMENT_NOT_CONFIGURED,
          'Payments are not available yet. Premium activation is disabled until checkout is configured.',
          503
        );
      }

      const order = await createPremiumOrder({
        candidateId: profile.id,
        userId: profile.userId,
        planId: input.planId,
      });

      // The provider order is created AFTER the row exists so the receipt can
      // reference the real order id. A gateway failure must not leave the
      // caller believing a payable order exists.
      const created = await provider.createOrder({
        receipt: order.orderNumber,
        amountMinor: order.amountMinor,
        currency: order.currency,
        note: `Ravelyth Talent premium ${order.orderNumber}`,
      });

      const { attachProviderOrderId } = await import('@/lib/portal/payments');
      await attachProviderOrderId(order.id, created.providerOrderId);

      return {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          amountMinor: order.amountMinor,
          currency: order.currency,
          status: order.status,
        },
        providerOrderId: created.providerOrderId,
        // The PUBLIC key id only. Secrets never reach the browser.
        providerKeyId: process.env.RAZORPAY_KEY_ID ?? null,
      };
    },
    () => 201
  );
}
