import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { getPublicCompanyProfile } from '@/lib/portal/jobs/search';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portal/companies/[id]
 *
 * Public company profile shown on a job detail page.
 *
 * Public fields only: no members, no contact details, no credit balance, no
 * orders. A suspended company is reported as missing rather than as suspended,
 * so this endpoint cannot be used to probe for companies that are not trading.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const { id } = await context.params;

    // Same cheap shape check as the job route: a malformed id looks missing.
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);
    }

    return getPublicCompanyProfile(id);
  });
}
