import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { listPaymentsForAdmin } from '@/lib/portal/admin/console';

/**
 * GET /api/portal/admin/payments
 *
 * Orders and their payment attempts, for revenue reporting and dispute
 * handling.
 *
 * READ-ONLY by design. An order becomes `paid` only when the provider's
 * signature verifies server-side, and there is intentionally no admin route
 * that can mark one paid: an administrator must not be able to create revenue
 * that was never collected. Corrections happen through the gateway, and the
 * webhook then writes the truthful result.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);

    return {
      items: await listPaymentsForAdmin({
        status: params.status,
        limit: Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100),
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
    };
  });
}
