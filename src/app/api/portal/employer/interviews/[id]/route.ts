import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { updateInterviewSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import {
  listInterviewHistory,
  rescheduleInterview,
  updateInterviewStatus,
} from '@/lib/portal/interviews';

/**
 * GET   /api/portal/employer/interviews/[id] - the interview plus its history
 * PATCH /api/portal/employer/interviews/[id] - reschedule or record an outcome
 *
 * Every operation is scoped to the caller's company inside the service, so an
 * id from another tenant resolves as 404 and nothing leaks.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const { id } = await context.params;
    return { items: await listInterviewHistory(id, company.id) };
  });
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company, user } = await requireCompanyContext();
    const { id } = await context.params;
    const input = parseWithSchema(updateInterviewSchema, await readJsonBody(req));

    const interview =
      input.action === 'reschedule'
        ? await rescheduleInterview({
            companyId: company.id,
            interviewId: id,
            actorUserId: user.id,
            scheduledAt: input.scheduledAt,
            durationMinutes: input.durationMinutes,
            mode: input.mode,
            locationOrLink: input.locationOrLink,
            note: input.note,
          })
        : await updateInterviewStatus({
            companyId: company.id,
            interviewId: id,
            actorUserId: user.id,
            status: input.status,
            notes: input.notes,
          });

    return { interview };
  });
}