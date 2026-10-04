import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { updateSubmissionSchema } from '@/app/api/portal/schemas';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import {
  listSubmissionEvents,
  updateSubmissionStatus,
} from '@/lib/portal/agency-submissions';

/**
 * GET   /api/portal/employer/agency-submissions/[id] - the submission history
 * PATCH /api/portal/employer/agency-submissions/[id] - move it to the next status
 *
 * Only the two parties may read or move a submission; a third company gets the
 * same 404 a non-existent id would produce. WHICH moves are permitted depends
 * on the side: the agency withdraws, the client decides.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const { id } = await context.params;
    return { items: await listSubmissionEvents(id, company.id) };
  });
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company, user } = await requireCompanyContext();
    const { id } = await context.params;
    const input = parseWithSchema(updateSubmissionSchema, await readJsonBody(req));

    const submission = await updateSubmissionStatus({
      submissionId: id,
      actorCompanyId: company.id,
      actorUserId: user.id,
      status: input.status,
      note: input.note,
    });

    return { submission };
  });
}