import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { listReportsForAdmin, resolveReport } from '@/lib/portal/reports';

/**
 * GET  /api/portal/admin/reports - moderation queue
 * PUT  /api/portal/admin/reports?reportId=... - resolve or dismiss
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);
    return {
      items: await listReportsForAdmin({
        status: params.status as never,
        limit: Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100),
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
    };
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const admin = await requireAdminUser();
    const params = parseSearchParams(req);
    const body = await readJsonBody(req);
    const input = parseWithSchema(
      z
        .object({
          status: z.enum(['reviewing', 'resolved', 'dismissed']),
          resolution: z.string().max(2000).nullish(),
          adminNotes: z.string().max(2000).nullish(),
        })
        .strict(),
      body
    );

    const reportId = params.reportId ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(reportId)) {
      throw new Error('A valid reportId is required.');
    }

    return { report: await resolveReport({ reportId, adminUserId: admin.id, ...input }) };
  });
}
