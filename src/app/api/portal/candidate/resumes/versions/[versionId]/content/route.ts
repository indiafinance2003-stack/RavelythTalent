import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { saveResumeBuilderContent } from '@/lib/portal/candidates/resumes';

type RouteContext = { params: Promise<{ versionId: string }> };

const contentSchema = z
  .object({ content: z.record(z.string(), z.unknown()) })
  .strict();

/**
 * PUT /api/portal/candidate/resumes/versions/[versionId]/content
 *
 * Saves the Resume Builder snapshot against one resume VERSION.
 *
 * Ownership is proved inside the service, which updates only rows belonging to
 * the caller's own candidate profile. Storing structured content here is what
 * lets the builder reopen a saved draft instead of losing it on refresh.
 *
 * The content is stored as JSONB and is never rendered as HTML; the preview is
 * built from this structure, not from markup the client supplies.
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const { versionId } = await context.params;
    const input = parseWithSchema(contentSchema, await readJsonBody(req));

    const version = await saveResumeBuilderContent(
      profile.id,
      versionId,
      input.content
    );

    if (!version) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume version was not found.', 404);
    }

    return { version };
  });
}
