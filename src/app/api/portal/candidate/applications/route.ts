import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { applyToJob, listCandidateApplications } from '@/lib/portal/applications';
import { requireVerifiedEmail } from '@/lib/auth/email-verification';
import { requireConsent } from '@/lib/portal/consents';
import { notifyApplicationSubmitted } from '@/lib/portal/candidate-notifications';
import { dbFromRequest } from '@/lib/db/request';
import { candidateProfiles } from '@/lib/db/portal-schema';

const bodySchema = z
  .object({
    jobId: z.string().uuid(),
    resumeVersionId: z.string().uuid().nullish(),
    coverLetter: z.string().max(5000).nullish(),
  })
  .strict();

/**
 * GET  /api/portal/candidate/applications - the caller's own applications
 * POST /api/portal/candidate/applications - apply to a job
 *
 * Server-side gates on apply, in order: candidate session, verified email
 * (when configured), `job_application` consent, then the application's own
 * published/deadline/duplicate checks. The candidate id comes from the session,
 * so a body naming someone else is simply ignored.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const params = parseSearchParams(req);

    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100);
    const offset = Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0);

    return { items: await listCandidateApplications(profile.id, { limit, offset }), limit, offset };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const profile = await requireCandidateProfile();
      const body = await readJsonBody(req);
      const input = parseWithSchema(bodySchema, body);

      // Resolve the owning account for the verification check and consent row.
      const { db } = dbFromRequest();
      const [owner] = await db
        .select({ userId: candidateProfiles.userId })
        .from(candidateProfiles)
        .where(eq(candidateProfiles.id, profile.id))
        .limit(1);
      if (!owner) {
        throw new Error('Candidate profile is not linked to a user account.');
      }

      // A security gate enforced here, not by hiding a button in the UI.
      await requireVerifiedEmail(owner.userId);

      // Consent must ALREADY have been given, explicitly, at registration.
      // Recording it here would let the act of applying manufacture its own
      // consent, which is exactly what purpose-specific consent exists to stop.
      await requireConsent(owner.userId, 'job_application');

      const application = await applyToJob({
        candidateProfileId: profile.id,
        jobId: input.jobId,
        resumeVersionId: input.resumeVersionId ?? null,
        coverLetter: input.coverLetter ?? null,
      });

      // Notifications run after the application is committed and never fail it.
      await notifyApplicationSubmitted({ applicationId: application.id });

      return { application };
    },
    () => 201
  );
}
