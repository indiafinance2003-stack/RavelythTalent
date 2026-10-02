import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { getApplicationHistory, updateApplicationStatus } from '@/lib/portal/applications';
import { APPLICATION_STATUSES } from '@/lib/db/portal-schema';
import { notifyApplicationStatusChanged } from '@/lib/portal/candidate-notifications';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES as unknown as [string, ...string[]]),
    note: z.string().max(2000).nullish(),
    employerNotes: z.string().max(4000).nullish(),
  })
  .strict();

/**
 * GET  /api/portal/employer/applications/[id] - one application + its history
 * PATCH /api/portal/employer/applications/[id] - move it to a new status
 *
 * Tenant isolation is enforced inside the service: the application is joined to
 * its job and rejected unless that job belongs to the caller's own company. An
 * employer guessing another employer's application id receives 404, not 403, so
 * the endpoint cannot be used to discover that an application exists.
 *
 * The status machine itself lives in the service, so an employer cannot invent a
 * transition (for example straight from `submitted` to `hired`).
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const { id } = await context.params;

    // Tenant-scoped inside the service: another employer's application id is
    // reported as not found rather than forbidden, so this endpoint cannot be
    // used to discover that a rival pipeline exists.
    return { history: await getApplicationHistory(id, company.id) };

  });
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { company, user } = await requireCompanyContext();
    const { id } = await context.params;

    const body = await readJsonBody(req);
    const input = parseWithSchema(updateSchema, body);

    const application = await updateApplicationStatus({
      applicationId: id,
      nextStatus: input.status as never,
      companyId: company.id,
      changedByUserId: user.id,
      note: input.note ?? null,
      employerNotes: input.employerNotes ?? null,
    });

    // Notification runs after the commit; a mail failure must never undo the
    // employer's decision or fail their request.
    await notifyApplicationStatusChanged({ applicationId: application.id });

    return { application };
  });
}
