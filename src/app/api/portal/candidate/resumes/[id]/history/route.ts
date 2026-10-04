import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { listVersionHistory } from '@/lib/portal/candidates/resume-builder';
import { listCandidateEntitlements } from '@/lib/portal/premium/entitlements';
import { resolveBuilderCapabilities } from '@/lib/portal/premium/entitlement-codes';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/portal/candidate/resumes/[id]/history
 *
 * The version history for one resume, newest first.
 *
 * Gated on `resume_version_history`. The capability set is returned even when the
 * history itself is refused, so the UI can show an accurate upgrade prompt instead
 * of a bare 403.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const { id } = await context.params;

    const granted = await listCandidateEntitlements(profile.id);
    const capabilities = resolveBuilderCapabilities(granted.map((row) => row.code));

    const versions = await listVersionHistory(profile.id, id);

    return { versions, capabilities };
  });
}
