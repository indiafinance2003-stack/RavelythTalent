import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { scheduleInterviewSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { listInterviewsForCompany, scheduleInterview } from '@/lib/portal/interviews';

/**
 * GET  /api/portal/employer/interviews - the company's interview schedule
 * POST /api/portal/employer/interviews - schedule an interview for an application
 *
 * Scheduling takes only the application id; candidate, company and round are
 * all derived server-side, and the plan capability (`interview_management`) is
 * enforced inside the service.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '50', 10) || 50, 1), 200);
    const items = await listInterviewsForCompany(company.id, {
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
      const input = parseWithSchema(scheduleInterviewSchema, await readJsonBody(req));

      const interview = await scheduleInterview({
        companyId: company.id,
        applicationId: input.applicationId,
        actorUserId: user.id,
        mode: input.mode,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        round: input.round,
        locationOrLink: input.locationOrLink,
        notes: input.notes,
      });

      return { interview };
    },
    () => 201
  );
}