import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { jobCreateSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import {
  createJob,
  listCompanyJobs,
  submitJobForApproval,
} from '@/lib/portal/jobs/service';
import { getCreditBalance } from '@/lib/portal/credits';

/**
 * GET  /api/portal/employer/jobs - the caller's company jobs
 * POST /api/portal/employer/jobs - create a DRAFT job
 *
 * The company id comes from the session, so an employer can never post a job
 * for (or read the jobs of) another company.
 *
 * A draft is never live: submitting for approval is a separate, explicit action
 * and the status is decided server-side.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100);

    return {
      items: await listCompanyJobs(company.id, {
        status: params.status,
        limit,
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
      credits: await getCreditBalance(company.id),
      limit,
    };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const { company, user } = await requireCompanyContext();
      const body = await readJsonBody(req);
      const input = parseWithSchema(jobCreateSchema, body);

      const job = await createJob({
        ...input,
        companyId: company.id,
        createdByUserId: user.id,
        applicationDeadline: input.applicationDeadline
          ? new Date(input.applicationDeadline)
          : null,
      });

      return { job, message: 'Draft saved. Submit it for review when you are ready.' };
    },
    () => 201
  );
}

/** POST /api/portal/employer/jobs?jobId=... - submit a draft for approval */
export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company, user } = await requireCompanyContext();
    const params = parseSearchParams(req);
    const jobId = params.jobId ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      throw new Error('A valid jobId is required.');
    }

    // The service enforces the transition rules; an employer cannot publish.
    const job = await submitJobForApproval({
      jobId,
      companyId: company.id,
      actorUserId: user.id,
    });

    return {
      job,
      message:
        job.status === 'pending_approval'
          ? 'Submitted for review. Your posting goes live once our team approves it.'
          : 'Your posting is live.',
    };
  });
}
