import { NextRequest } from 'next/server';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import { readInvoicePdfForCompany } from '@/lib/portal/invoices';
import { sanitizeFilename } from '@/lib/uploads/validation';

interface RouteContext {
  params: Promise<{ invoiceId: string }>;
}

/** GET /api/portal/employer/invoices/[invoiceId]/pdf - private invoice PDF download. */
export async function GET(_req: NextRequest, context: RouteContext): Promise<Response> {
  const { company } = await requireCompanyContext();
  const { invoiceId } = await context.params;
  const file = await readInvoicePdfForCompany(invoiceId, company.id);

  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.byteLength),
      'Content-Disposition': `attachment; filename="${sanitizeFilename(file.filename)}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
