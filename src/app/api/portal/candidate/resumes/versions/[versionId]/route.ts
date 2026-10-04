import { NextRequest } from 'next/server';
import { currentPortalUser } from '@/lib/portal/auth-context';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { readResumeForAuthorizedViewer } from '@/lib/portal/candidates/resumes';
import { resolveResumeAccessContext } from '@/lib/portal/candidates/resume-access';
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
 * Derives the viewer's capabilities from the SESSION role alone, via the shared
 * helper that the generated-PDF download route also uses.
 */
export async function GET(_req: NextRequest, context: RouteContext): Promise<Response> {
  const user = await currentPortalUser();
  if (!user) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, 'Sign in to continue.', 401);
  }

  const { versionId } = await context.params;
  const ctx = await resolveResumeAccessContext(user);

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
