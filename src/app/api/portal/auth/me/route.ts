import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { currentPortalUser, requireCandidateProfile } from '@/lib/portal/auth-context';
import { getCandidateSubscription, listCandidateEntitlements } from '@/lib/portal/premium/entitlements';
import { getProfileCompletion } from '@/lib/portal/candidates/profile';

/**
 * GET /api/portal/auth/me
 *
 * The current session. Returns null-safe 200 with `user: null` when nobody is
 * signed in, so a frontend can call this on load without treating "not signed
 * in" as an error.
 *
 * Nothing here accepts a user id: the identity is the session cookie.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await currentPortalUser();
    if (!user) return { user: null };

    const payload: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };

    // Role-specific context, so the frontend gets what it needs in one call.
    if (user.role === 'candidate') {
      try {
        const profile = await requireCandidateProfile();
        payload.candidateProfile = { id: profile.id, fullName: profile.fullName };
        payload.profileCompletion = (await getProfileCompletion(profile.id)).percentage;
        payload.subscription = await getCandidateSubscription(profile.id);
        payload.entitlements = await listCandidateEntitlements(profile.id);
      } catch {
        // A candidate without a profile yet is still a valid session.
      }
    }

    return { user: payload };
  });
}
