import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { profileUpdateSchema } from '@/app/api/portal/schemas';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import {
  getProfileCompletion,
  updateCandidateProfile,
} from '@/lib/portal/candidates/profile';

/**
 * GET  /api/portal/candidate/profile - the caller's own profile
 * PUT  /api/portal/candidate/profile - update the caller's own profile
 *
 * The candidate id is resolved from the SESSION, never from the request, so
 * there is no way to address another candidate's profile.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    return { profile, completion: await getProfileCompletion(profile.id) };
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const body = await readJsonBody(req);
    const input = parseWithSchema(profileUpdateSchema, body);

    const updated = await updateCandidateProfile(profile.id, input);
    return { profile: updated, completion: await getProfileCompletion(profile.id) };
  });
}
