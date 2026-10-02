import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { createOrderSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { createOrder, listCompanyOrders } from '@/lib/portal/payments';
import { isPaymentConfigured } from '@/lib/billing/providers';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';

/**
 * GET  /api/portal/employer/orders - the caller's company orders
 * POST /api/portal/employer/orders - start a purchase
 *
 * The request carries ONLY a packageId and the terms acceptance. The amount is
 * read from the package row in `createOrder`, so a client cannot influence what
 * is charged, and a client claiming a payment succeeded changes nothing here —
 * only a verified webhook or a server-side signature check can mark it paid.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    return { items: await listCompanyOrders(company.id) };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const { company, user } = await requireCompanyContext();
      const body = await readJsonBody(req);
      const input = parseWithSchema(createOrderSchema, body);

      // Be honest when payments are not configured rather than pretending.
      if (!isPaymentConfigured()) {
        throw new AppError(
          AppErrorCode.PAYMENT_NOT_CONFIGURED,
          'Payments are not available yet. Please contact support to purchase job credits.',
          503
        );
      }

      const order = await createOrder({
        companyId: company.id,
        userId: user.id,
        packageId: input.packageId,
        nonRefundableAccepted: input.nonRefundableAccepted,
      });

      return { order };
    },
    () => 201
  );
}
