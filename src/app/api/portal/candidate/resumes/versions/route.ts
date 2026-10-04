import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { createBuilderVersion } from '@/lib/portal/candidates/resume-builder';
import { listCandidateEntitlements } from '@/lib/portal/premium/entitlements';
import { resolveBuilderCapabilities } from '@/lib/portal/premium/entitlement-codes';

const createSchema = z
  .object({
    resumeId: z.string().uuid(),
    label: z.string().max(120).nullish(),
  })
  .strict();

/**
 * POST /api/portal/candidate/resumes/versions
 *
 * Snapshots the current working copy into an immutable version.
 *
 * This is a JSON route on purpose, kept separate from `[id]/versions` (which takes
 * a multipart upload) rather than branching on Content-Type inside that handler.
 * The two create genuinely different things — an uploaded document versus a
 * structured snapshot — and one endpoint that silently does either depending on a
 * header is an endpoint nobody can reason about.
 *
 * The `multiple_resume_versions` gate lives in the service, inside the inserting
 * transaction, so it cannot be bypassed by calling this endpoint directly and it
 * cannot be raced by two clicks.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const profile = await requireCandidateProfile();
      const body = await readJsonBody(req);
      const input = parseWithSchema(createSchema, body);

      const version = await createBuilderVersion(profile.id, input.resumeId, {
        label: input.label ?? null,
      });

      const granted = await listCandidateEntitlements(profile.id);

      return {
        version,
        capabilities: resolveBuilderCapabilities(granted.map((row) => row.code)),
      };
    },
    () => 201
  );
}
