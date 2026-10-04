import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { restoreVersionToDraft } from '@/lib/portal/candidates/resume-builder';

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

/**
 * POST /api/portal/candidate/resumes/versions/[versionId]/restore
 *
 * Copies an earlier version's content back into the working copy.
 *
 * POST rather than PUT because this is a command with a side effect that is not
 * idempotent in meaning: "restore v2" twice is still "restore v2", but the point
 * of the verb here is that it changes server state rather than replacing a
 * resource body.
 *
 * Later versions are NOT deleted. Restoring is how a candidate starts again from
 * an earlier point, and to make the restored state durable they then save a new
 * version — which is also what keeps the history honest about what happened.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const { versionId } = await context.params;

    const draft = await restoreVersionToDraft(profile.id, versionId);
    return { draft };
  });
}
