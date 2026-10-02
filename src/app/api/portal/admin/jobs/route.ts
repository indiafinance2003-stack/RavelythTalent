import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { reviewJobSchema } from '@/app/api/portal/schemas';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { listJobsForAdmin, reviewJob } from '@/lib/portal/jobs/service';
import { parseSearchParams } from '@/lib/errors/api-handler';
import { getPlatformStats } from '@/lib/portal/admin/stats';

/**
 * GET  /api/portal/admin/jobs - the review queue
 * PUT  /api/portal/admin/jobs?jobId=... - approve or reject a posting
 *
 * `requireAdminUser()` runs BEFORE any work, so an employer or candidate
 * receives 403 and never learns whether a job id exists.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100);

    return {
      items: await listJobsForAdmin({
        status: params.status,
        limit,
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
      stats: await getPlatformStats(),
      limit,
    };
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const admin = await requireAdminUser();
    const params = parseSearchParams(req);
    const body = await readJsonBody(req);
    const input = parseWithSchema(reviewJobSchema, body);

    const jobId = params.jobId ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      throw new Error('A valid jobId is required.');
    }

    // The service rejects an approval of a job that is not pending, and
    // requires a reason for a rejection.
    const job = await reviewJob({
      jobId,
      decision: input.decision,
      adminUserId: admin.id,
      reason: input.reason ?? null,
    });

    return { job };
  });
}
