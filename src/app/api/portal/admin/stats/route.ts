import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { getPlatformStats, getApplicationSeries, getRegistrationSeries } from '@/lib/portal/admin/stats';

/**
 * GET /api/portal/admin/stats
 *
 * Platform dashboard figures. `requireAdminUser()` runs first, so these
 * aggregates are never readable by a candidate or employer.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    return {
      stats: await getPlatformStats(),
      applicationSeries: await getApplicationSeries(30),
      registrationSeries: await getRegistrationSeries(30),
    };
  });
}
