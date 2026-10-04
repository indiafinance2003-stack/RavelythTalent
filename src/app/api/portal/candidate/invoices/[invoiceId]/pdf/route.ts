import { NextRequest } from 'next/server';
import { requireCandidateUser } from '@/lib/portal/auth-context';
import { readInvoicePdfForUser } from '@/lib/portal/invoices';
import { sanitizeFilename } from '@/lib/uploads/validation';

interface RouteContext {
  params: Promise<{ invoiceId: string }>;
}

/** GET /api/portal/candidate/invoices/[invoiceId]/pdf - private candidate invoice PDF download. */
export async function GET(_req: NextRequest, context: RouteContext): Promise<Response> {
  const user = await requireCandidateUser();
  const { invoiceId } = await context.params;
  const file = await readInvoicePdfForUser(invoiceId, user.id);

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
