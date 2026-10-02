import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import { getPreferences, updatePreferences } from '@/lib/portal/candidates/details';

const preferencesSchema = z
  .object({
    preferredLocations: z.array(z.string().min(1).max(120)).max(20).optional(),
    preferredJobTypes: z.array(z.string().min(1).max(40)).max(10).optional(),
    preferredWorkModes: z.array(z.string().min(1).max(40)).max(10).optional(),
    preferredIndustries: z.array(z.string().min(1).max(80)).max(20).optional(),
    minSalaryMinor: z.number().int().min(0).nullish(),
    alertFrequency: z.enum(['daily', 'weekly']).optional(),
    jobAlertEnabled: z.boolean().optional(),
  })
  .strict();

/**
 * GET /api/portal/candidate/preferences - job preferences
 * PUT /api/portal/candidate/preferences - update them
 *
 * Owned by the session's candidate, like every other candidate resource. Lists
 * are normalised and de-duplicated server-side, so "Remote" and "remote" can
 * never both appear as chips in the UI.
 *
 * `minSalaryMinor` is integer minor units (paise). The frontend must divide for
 * display and must never send a pre-formatted string.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    return { preferences: await getPreferences(profile.id) };
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const input = parseWithSchema(preferencesSchema, await readJsonBody(req));
    return { preferences: await updatePreferences(profile.id, input) };
  });
}
