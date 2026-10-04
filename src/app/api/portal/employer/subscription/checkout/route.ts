import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { createPlanCheckoutSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { attachProviderOrderId, createPlanOrder } from '@/lib/portal/payments';
import { getBillingProvider, isPaymentConfigured } from '@/lib/billing/providers';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';

/**
 * POST /api/portal/employer/subscription/checkout - start a plan purchase.
 *
 * The request carries ONLY the plan id, the billing period and the terms
 * acceptance. The amount is computed from the plan row plus the configured tax
 * rate inside `createPlanOrder`, so a client cannot influence what is charged,
 * and nothing here activates anything: the subscription only changes when a
 * verified webhook or server-side signature check marks the order paid.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const { company, user } = await requireCompanyContext();
      const body = await readJsonBody(req);
      const input = parseWithSchema(createPlanCheckoutSchema, body);

      // Be honest when payments are not configured rather than pretending.
      const provider = getBillingProvider();
      if (!isPaymentConfigured() || !provider) {
        throw new AppError(
          AppErrorCode.PAYMENT_NOT_CONFIGURED,
          'Payments are not available yet. Please contact support to start a plan.',
          503
        );
      }

      const order = await createPlanOrder({
        companyId: company.id,
        userId: user.id,
        planId: input.planId,
        billingPeriod: input.billingPeriod,
        nonRefundableAccepted: input.nonRefundableAccepted,
      });

      // Create the matching order at the gateway so the browser has something
      // payable. The local row already exists, so the receipt can reference it.
      const created = await provider.createOrder({
        receipt: order.orderNumber,
        amountMinor: order.amountMinor,
        currency: order.currency,
        note: `Ravelyth Talent subscription ${order.orderNumber}`,
      });

      await attachProviderOrderId(order.id, created.providerOrderId);

      return {
        order: { ...order, providerOrderId: created.providerOrderId },
        // The PUBLIC key id only; the secret never leaves the server.
        providerKeyId: process.env.RAZORPAY_KEY_ID ?? null,
      };
    },
    () => 201
  );
}