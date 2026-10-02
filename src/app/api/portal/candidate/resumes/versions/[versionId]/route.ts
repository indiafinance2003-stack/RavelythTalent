import { NextRequest } from 'next/server';
import { currentPortalUser } from '@/lib/portal/auth-context';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { readResumeForAuthorizedViewer } from '@/lib/portal/candidates/resumes';
import type { ResumeAccessContext } from '@/lib/portal/candidates/resumes';
import { dbFromRequest } from '@/lib/db/request';
import { candidateProfiles, employerProfiles } from '@/lib/db/portal-schema';
import { eq } from 'drizzle-orm';
import type { PortalUser } from '@/lib/portal/authz';
import { sanitizeFilename } from '@/lib/uploads/validation';

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

/**
 * GET /api/portal/candidate/resumes/versions/[versionId]
 *
 * Serves the actual resume file bytes. This is the ONLY endpoint that returns
 * resume content, and it is deliberately separate from the listing endpoint so
 * that authorization cannot be forgotten.
 *
 * A read is allowed only for:
 *   - the candidate who owns the resume,
 *   - an employer, and then only the exact version submitted with a real
 *     application to a job at their OWN company, or
 *   - an administrator exercising oversight.
 *
 * A denied read returns 404 rather than 403, so an employer cannot probe for
 * the existence of resume ids they are not entitled to. Every successful read
 * is written to the access log so the candidate can review who opened it.
 */

/**
 * Derives the viewer's capabilities from the SESSION role alone.
 *
 * Nothing here reads a user, company or candidate id from the request, so the
 * endpoint cannot be talked into acting on someone else's behalf.
 */
async function resolveAccessContext(user: PortalUser): Promise<ResumeAccessContext> {
  if (user.role === 'admin') {
    return { adminUserId: user.id };
  }

  const { db } = dbFromRequest();

  if (user.role === 'candidate') {
    const [profile] = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, user.id))
      .limit(1);
    // A candidate with no profile can only ever match the empty id, which the
    // service treats as "not the owner".
    return { candidateProfileId: profile?.id ?? null };
  }

  const [employer] = await db
    .select({ companyId: employerProfiles.companyId })
    .from(employerProfiles)
    .where(eq(employerProfiles.userId, user.id))
    .limit(1);

  // No linked company means no company scope, so no employer access at all.
  return {
    employerUserId: user.id,
    companyId: employer?.companyId ?? null,
  };
}

export async function GET(_req: NextRequest, context: RouteContext): Promise<Response> {
  const user = await currentPortalUser();
  if (!user) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, 'Sign in to continue.', 401);
  }

  const { versionId } = await context.params;
  const ctx = await resolveAccessContext(user);

  // Throws 404 when the viewer is not entitled to this version.
  const file = await readResumeForAuthorizedViewer(versionId, ctx);

  // Bytes are returned directly, never wrapped in a JSON envelope: a base64
  // envelope would inflate the payload and tempt clients to log the content.
  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.byteLength),
      // The filename is sanitized again here, at the last possible moment.
      'Content-Disposition': `attachment; filename="${sanitizeFilename(file.filename)}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
