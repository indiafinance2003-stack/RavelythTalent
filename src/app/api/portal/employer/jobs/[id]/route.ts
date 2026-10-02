import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { jobUpdateSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import {
  getCompanyJob,
  getJobHistory,
  updateJob,
  withdrawJob,
} from '@/lib/portal/jobs/service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET    /api/portal/employer/jobs/[id] - one of the caller's own jobs
 * PATCH  /api/portal/employer/jobs/[id] - edit a draft or pending job
 * DELETE /api/portal/employer/jobs/[id] - withdraw a pending/rejected job
 *
 * Ownership is proved by `getCompanyJob`, which filters on the session's own
 * company. Another employer's job id therefore returns 404 rather than 403, so
 * the endpoint cannot be used to discover that a competitor has a posting.
 *
 * Editing a job that a moderator already looked at returns
 * `requiresReapproval: true`: a material edit sends it back through approval
 * rather than letting an approved posting be quietly rewritten.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const { id } = await context.params;

    const job = await getCompanyJob(id, company.id);
    return { job, history: await getJobHistory(id) };
  });
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company, user } = await requireCompanyContext();
    const { id } = await context.params;

    const body = await readJsonBody(req);
    const changes = parseWithSchema(jobUpdateSchema, body);

    const result = await updateJob({
      jobId: id,
      companyId: company.id,
      actorUserId: user.id,
      changes: {
        ...changes,
        // The wire format is an ISO string; the service stores a real Date.
        applicationDeadline: changes.applicationDeadline
          ? new Date(changes.applicationDeadline)
          : null,
      },
    });

    return result;
  });
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company, user } = await requireCompanyContext();
    const { id } = await context.params;

    // Returns the credit when one was consumed, so withdrawing is not punitive.
    const job = await withdrawJob({
      jobId: id,
      companyId: company.id,
      actorUserId: user.id,
    });

    return { job };
  });
}