import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { listResumeVersions, uploadResumeVersion } from '@/lib/portal/candidates/resumes';
import { requireConsent } from '@/lib/portal/consents';
import { config } from '@/lib/config';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/portal/candidate/resumes/[id]/versions
 *
 * Uploads a new VERSION of one resume as multipart/form-data.
 *
 * The resume id in the path is only a container selector: ownership is proved by
 * the candidate id taken from the session inside the service, so passing someone
 * else's resume id yields 404 rather than an upload into their account.
 *
 * Requires `resume_storage` consent. Storing a candidate's document for them is a
 * distinct purpose from registering or applying, and is never implied by either.
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const profile = await requireCandidateProfile();
      const { id } = await context.params;

      await requireConsent(profile.userId, 'resume_storage');

      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new AppError(
          AppErrorCode.VALIDATION_ERROR,
          'Send the resume as multipart/form-data with a "file" part.',
          400
        );
      }

      const file = form.get('file');
      if (!(file instanceof File)) {
        throw new AppError(
          AppErrorCode.VALIDATION_ERROR,
          'A resume file is required in the "file" field.',
          400
        );
      }

      // Reject an oversized upload before buffering the whole body in memory.
      if (file.size > config.PORTAL_MAX_RESUME_BYTES) {
        throw new AppError(
          AppErrorCode.VALIDATION_ERROR,
          'That resume file is too large.',
          400
        );
      }

      const body = Buffer.from(await file.arrayBuffer());

      const version = await uploadResumeVersion({
        candidateId: profile.id,
        resumeId: id,
        filename: file.name,
        contentType: file.type || null,
        body,
      });

      return { version };
    },
    () => 201
  );
}

/** GET /api/portal/candidate/resumes/[id]/versions - this resume's versions */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const { id } = await context.params;
    return { versions: await listResumeVersions(profile.id, id) };
  });
}
