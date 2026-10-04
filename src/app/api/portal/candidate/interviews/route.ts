import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { listInterviewsForCandidate } from '@/lib/portal/interviews';

/**
 * GET /api/portal/candidate/interviews - the candidate's own schedule.
 *
 * The candidate id comes from the session, never from the query string, and the
 * DTO this returns structurally excludes interviewer notes.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '50', 10) || 50, 1), 200);
    return { items: await listInterviewsForCandidate(profile.id, { limit }) };
  });
}