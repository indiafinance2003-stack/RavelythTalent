import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { ValidationError } from '@/lib/errors/app-error';
import { listSavedJobs, saveJob, unsaveJob } from '@/lib/portal/candidates/saved-jobs';

const saveSchema = z.object({ jobId: z.string().uuid() }).strict();

/**
 * GET    /api/portal/candidate/saved-jobs - the caller's saved jobs
 * POST   /api/portal/candidate/saved-jobs - save a job (idempotent)
 * DELETE /api/portal/candidate/saved-jobs - unsave a job
 *
 * Saving an already saved job is a no-op that reports `saved: false`, so a
 * double click cannot create a duplicate.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100);
    return { items: await listSavedJobs(profile.id, { limit }) };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const body = await readJsonBody(req);
    const input = parseWithSchema(saveSchema, body);
    const saved = await saveJob(profile.id, input.jobId);
    return { saved, jobId: input.jobId };
  });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const params = parseSearchParams(req);
    const jobId = params.jobId ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      throw new ValidationError('A valid jobId is required.');
    }
    const removed = await unsaveJob(profile.id, jobId);
    return { removed, jobId };
  });
}

