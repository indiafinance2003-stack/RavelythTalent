import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import {
  BillingVerificationError,
  getBillingProvider,
} from '@/lib/billing/providers';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import {
  findOrderByProviderOrderId,
  markOrderPaidAndGrantCredits,
} from '@/lib/portal/payments';

const confirmSchema = z
  .object({
    providerPaymentId: z.string().min(1).max(200),
    providerOrderId: z.string().min(1).max(200),
    signature: z.string().min(1).max(500),
  })
  .strict();

/**
 * POST /api/portal/payments/confirm
 *
 * Applies a payment the browser just made, WITHOUT trusting the browser.
 *
 * This is the normal counterpart to the webhook for the user's own checkout,
 * where waiting for a gateway retry would be poor UX. The browser's claim is
 * treated purely as a SIGNAL: the provider signature is verified server-side
 * first, and only then does the order transition to paid.
 *
 * Consequences worth being explicit about:
 *  - a client that posts a bogus signature changes nothing (400);
 *  - the amount checked is the STORED order's amount, not the client's;
 *  - `markOrderPaidAndGrantCredits` is idempotent, so confirming twice, or
 *    confirming a payment the webhook already handled, grants credits once.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const provider = getBillingProvider();
    if (!provider) {
      throw new AppError(
        AppErrorCode.PAYMENT_NOT_CONFIGURED,
        'Payments are not available right now.',
        503
      );
    }

    const input = parseWithSchema(confirmSchema, await readJsonBody(req));

    // The order is located by the PROVIDER's id, never by a client-supplied
    // order id, so this cannot be pointed at somebody else's purchase.
    const order = await findOrderByProviderOrderId(input.providerOrderId);
    if (!order) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'The requested order was not found.', 404);
    }

    try {
      // The expected amount is the stored order's, so a tampered client value
      // cannot make a cheap payment satisfy an expensive order.
      await provider.verifyPayment(
        {
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId,
          signature: input.signature,
        },
        { amountMinor: order.amountMinor, currency: order.currency }
      );
    } catch (error) {
      if (error instanceof BillingVerificationError) {
        // A failed signature is a probable forgery: change nothing.
        throw new AppError(
          AppErrorCode.VALIDATION_ERROR,
          'The payment could not be verified.',
          400
        );
      }
      throw error;
    }

    const result = await markOrderPaidAndGrantCredits({
      orderId: order.id,
      providerPaymentId: input.providerPaymentId,
      providerOrderId: input.providerOrderId,
    });

    return {
      // `alreadyProcessed` is reported honestly so the UI can tell "we credited
      // you now" apart from "the webhook already did".
      paid: true,
      alreadyProcessed: result.alreadyProcessed,
      grantedCredits: result.grantedCredits,
      orderStatus: 'paid',
    };
  });
}
