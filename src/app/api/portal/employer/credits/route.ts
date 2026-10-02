import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { getCreditBalance, listCreditLedger } from '@/lib/portal/credits';
import { listJobPackages } from '@/lib/portal/admin/users';
import { parseSearchParams } from '@/lib/errors/api-handler';

/**
 * GET /api/portal/employer/credits
 *
 * The caller's own credit balance, the purchase history behind it, and the
 * current package catalogue. Package prices are read from admin-managed rows;
 * the employer cannot influence them.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);

    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100);

    return {
      balance: await getCreditBalance(company.id),
      ledger: await listCreditLedger(company.id, {
        limit,
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
      packages: await listJobPackages(),
    };
  });
}
