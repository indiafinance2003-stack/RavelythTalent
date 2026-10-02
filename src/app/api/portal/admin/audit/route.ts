import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { listPortalAudit, PORTAL_AUDIT_ACTIONS } from '@/lib/portal/audit';

/**
 * GET /api/portal/admin/audit
 *
 * The platform audit trail. Entries carry identifiers and status transitions
 * only: passwords, tokens and payment secrets are filtered out on write by
 * `sanitizeAuditMetadata`, so this endpoint is safe to display.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);

    return {
      items: await listPortalAudit({
        action: params.action as never,
        actorUserId: params.actorUserId,
        limit: Math.min(Math.max(Number.parseInt(params.limit ?? '50', 10) || 50, 1), 200),
        offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
      }),
      // The closed action set, so the console can render a filter without
      // hard-coding it.
      actions: PORTAL_AUDIT_ACTIONS,
    };
  });
}
