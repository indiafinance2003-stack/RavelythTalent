import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { currentPortalUser, requireCandidateProfile } from '@/lib/portal/auth-context';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import {
  exportResumePdf,
  readResumePdfForAuthorizedViewer,
} from '@/lib/portal/candidates/resume-builder';
import { resolveResumeAccessContext } from '@/lib/portal/candidates/resume-access';
import { sanitizeFilename } from '@/lib/uploads/validation';

interface RouteContext {
  params: Promise<{ versionId: string }>;
}

/**
 * The generated PDF of one resume version. Two verbs, two deliberately different
 * trust models — they share a path because they address the same thing, but they
 * must never share an authorization rule:
 *
 *   POST (generate) is OWNER-ONLY. It renders the candidate's structured content
 *         and spends the `pdf_resume_export` entitlement. An employer must not be
 *         able to make the candidate's server render anything.
 *   GET  (download) is the SHARED read. It reuses the exact authorization decision
 *         used for the uploaded source document: owner, admin, or an employer and
 *         then only the exact version submitted with a real application to a job
 *         at their own company.
 *
 * If the GET were reachable more loosely than the source-file route, asking for
 * the PDF would become a way to read somebody's private draft.
 */

/**
 * POST — generate the PDF, store it privately, return metadata only.
 *
 * POST rather than GET because this creates a stored object and mutates the
 * version row: it must not be triggered by a link prefetch, a crawler, or a
 * browser retry. The storage key is never returned — it is the capability for
 * reading the object, and the platform has no route mapping a key to a public
 * path, so exposing it would defeat that design.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const { versionId } = await context.params;

    const exported = await exportResumePdf(profile.id, versionId);

    return {
      pdf: {
        versionId: exported.versionId,
        templateCode: exported.templateCode,
        byteSize: exported.byteSize,
        checksumSha256: exported.checksumSha256,
        renderedSections: exported.renderedSections,
        generatedAt: exported.generatedAt,
      },
    };
  });
}

/**
 * GET — download a previously generated PDF.
 *
 * Returns raw bytes rather than a base64 JSON envelope, which would inflate the
 * payload by a third and tempt clients to log the content. A denied read returns
 * 404, not 403, so this cannot be used to discover which version ids exist. Every
 * successful read is written to the access log alongside the source-document read.
 */
export async function GET(_req: NextRequest, context: RouteContext): Promise<Response> {
  const user = await currentPortalUser();
  if (!user) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, 'Sign in to continue.', 401);
  }

  const { versionId } = await context.params;
  const ctx = await resolveResumeAccessContext(user);

  // Throws 404 when the viewer is not entitled to this version, and 404 when no
  // PDF has been generated for it yet.
  const file = await readResumePdfForAuthorizedViewer(versionId, ctx);

  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.body.byteLength),
      // Sanitized again here, at the last possible moment: the filename is
      // derived from candidate-supplied labels.
      'Content-Disposition': `attachment; filename="${sanitizeFilename(file.filename)}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
