import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { listInvoicesForCompany } from '@/lib/portal/invoices';

/**
 * GET /api/portal/employer/invoices - the company's billing documents.
 *
 * Scoped to the caller's company: one tenant can never read another tenant's
 * invoices, whatever id it puts in the query string (there is no id parameter
 * to put there).
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0);
    return { items: await listInvoicesForCompany(company.id, { limit, offset }) };
  });
}