import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { submitCandidateSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import {
  listSubmissionsForCompany,
  submitCandidate,
} from '@/lib/portal/agency-submissions';

/**
 * GET  /api/portal/employer/agency-submissions - submissions this company can
 *                                                see (agency side and/or client side)
 * POST /api/portal/employer/agency-submissions - the agency puts a candidate forward
 *
 * The request names only the job and the candidate. The client company, the
 * agency's authority and the candidate's consent are all resolved server-side,
 * so a client cannot be named into existence by a request body.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '50', 10) || 50, 1), 200);
    const items = await listSubmissionsForCompany(company.id, {
      status: params.status,
      limit,
    });
    return { items };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const { company, user } = await requireCompanyContext();
      const input = parseWithSchema(submitCandidateSchema, await readJsonBody(req));

      const result = await submitCandidate({
        agencyCompanyId: company.id,
        actorUserId: user.id,
        jobId: input.jobId,
        candidateId: input.candidateId,
        notes: input.notes,
      });

      return { submission: result.submission, created: result.created };
    },
    () => 201
  );
}