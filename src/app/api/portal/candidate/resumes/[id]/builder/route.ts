import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import {
  getBuilderDraft,
  saveBuilderDraft,
} from '@/lib/portal/candidates/resume-builder';
import {
  listCandidateEntitlements,
} from '@/lib/portal/premium/entitlements';
import { resolveBuilderCapabilities } from '@/lib/portal/premium/entitlement-codes';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const saveSchema = z
  .object({
    // Passed through to `parseResumeDocument`, which owns the real shape. This is
    // deliberately loose here so the 400 comes back with per-field messages
    // ("experience.0.role: Required") instead of a generic schema error.
    document: z.unknown(),
    templateCode: z.string().max(60).nullish(),
    label: z.string().max(120).optional(),
  })
  .strict();

/**
 * GET /api/portal/candidate/resumes/[id]/builder
 *
 * Returns the working copy plus the resolved template. Reading is not a paid
 * capability: a candidate whose plan lapsed must still be able to see, and
 * export, work they already have.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const { id } = await context.params;
    return { draft: await getBuilderDraft(profile.id, id) };
  });
}

/**
 * PUT /api/portal/candidate/resumes/[id]/builder
 *
 * Saves the working copy. This is where `resume_builder_premium` is enforced, and
 * where a premium template is refused — both on the server, because both values
 * arrive in the request body.
 *
 * `capabilities` is returned alongside the saved draft so the UI can immediately
 * re-render its locked/unlocked controls from the server's own answer instead of
 * re-guessing locally.
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const { id } = await context.params;
    const body = await readJsonBody(req);
    const input = parseWithSchema(saveSchema, body);

    const draft = await saveBuilderDraft(profile.id, id, {
      document: input.document,
      templateCode: input.templateCode ?? null,
      label: input.label,
    });

    const granted = await listCandidateEntitlements(profile.id);

    return {
      draft,
      capabilities: resolveBuilderCapabilities(granted.map((row) => row.code)),
    };
  });
}
