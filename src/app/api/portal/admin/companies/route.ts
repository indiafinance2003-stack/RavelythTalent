import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { listCompaniesForAdmin } from '@/lib/portal/employers/company';

/**
 * GET /api/portal/admin/companies
 *
 * The company verification queue. A company is never verified automatically, so
 * this list is where an admin grants or refuses trust.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);

    return {
      items: await listCompaniesForAdmin({
        status: params.status,
        limit: Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100),
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
    };
  });
}
