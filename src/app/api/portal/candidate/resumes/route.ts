import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import {
  createResume,
  listResumes,
  listResumeTemplates,
  setDefaultResume,
} from '@/lib/portal/candidates/resumes';

const createSchema = z
  .object({
    label: z.string().min(1).max(120),
    templateCode: z.string().max(60).nullish(),
    makeDefault: z.boolean().optional(),
  })
  .strict();

/**
 * GET  /api/portal/candidate/resumes - the caller's resumes + templates
 * POST /api/portal/candidate/resumes - create a resume container
 *
 * The candidate id is resolved from the session. Note that resume FILE bytes are
 * never served from this route: a download always goes through the authorized
 * read endpoint, which records an access log entry.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    return {
      resumes: await listResumes(profile.id),
      templates: await listResumeTemplates(),
    };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const profile = await requireCandidateProfile();
      const body = await readJsonBody(req);
      const input = parseWithSchema(createSchema, body);

      const resume = await createResume(profile.id, {
        label: input.label,
        templateCode: input.templateCode ?? null,
        makeDefault: input.makeDefault ?? false,
      });
      return { resume };
    },
    () => 201
  );
}

/** PATCH /api/portal/candidate/resumes - promote a resume to default */
export async function PATCH(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const body = await readJsonBody(req);
    const input = parseWithSchema(
      z.object({ resumeId: z.string().uuid(), isDefault: z.literal(true) }).strict(),
      body
    );
    await setDefaultResume(profile.id, input.resumeId);
    return { resumes: await listResumes(profile.id) };
  });
}
