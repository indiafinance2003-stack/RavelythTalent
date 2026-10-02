import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requirePortalUser } from '@/lib/portal/auth-context';
import { createReport, listReportsByReporter } from '@/lib/portal/reports';

const reportSchema = z
  .object({
    targetType: z.enum(['job', 'company', 'employer', 'candidate']),
    targetId: z.string().min(1).max(64),
    reason: z.enum([
      'inappropriate_content',
      'misleading_or_scam',
      'discriminatory',
      'spam_or_duplicate',
      'copyright_or_trademark',
      'other',
    ]),
    description: z.string().max(2000).nullish(),
  })
  .strict();

/**
 * GET  /api/portal/reports - reports the caller filed, with their outcome
 * POST /api/portal/reports - file a report about a job, company or person
 *
 * The reporter is taken from the SESSION, never from the body, so a user cannot
 * file a complaint in someone else's name or read their reports.
 *
 * Filing a report does NOT hide the target and does not notify the reported
 * party. Takedown decisions belong to an admin through the admin reports route,
 * which is where the outcome is recorded and audited.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requirePortalUser();
    return { items: await listReportsByReporter(user.id) };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const user = await requirePortalUser();
      const body = await readJsonBody(req);
      const input = parseWithSchema(reportSchema, body);

      const report = await createReport({
        reporterUserId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        description: input.description ?? null,
      });

      return { report };
    },
    () => 201
  );
}
