import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { listApplicationsForAdmin } from '@/lib/portal/admin/console';

/**
 * GET /api/portal/admin/applications
 *
 * A platform-wide, READ-ONLY view of applications for moderation and dispute
 * handling. There is deliberately no PUT here: an application status is the
 * employer's decision to make, so the console can read the pipeline but cannot
 * move a candidate through it.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);

    return {
      items: await listApplicationsForAdmin({
        status: params.status,
        limit: Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100),
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
    };
  });
}
