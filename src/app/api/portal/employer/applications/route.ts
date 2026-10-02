import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { listCompanyApplications } from '@/lib/portal/applications';
import { APPLICATION_STATUSES } from '@/lib/db/portal-schema';
import { ValidationError } from '@/lib/errors/app-error';

/**
 * GET /api/portal/employer/applications
 *
 * Applications to THIS company's jobs only. The company id is resolved from
 * the session, so another employer's applicants are unreachable even if their
 * application id is guessed.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);

    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100);
    const offset = Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0);

    const status = params.status;
    if (status && !APPLICATION_STATUSES.includes(status as never)) {
      throw new ValidationError(`status must be one of: ${APPLICATION_STATUSES.join(', ')}.`);
    }

    return {
      items: await listCompanyApplications(company.id, {
        status: status as never,
        jobId: params.jobId,
        limit,
        offset,
      }),
      limit,
      offset,
    };
  });
}
