import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import {
  listSavedCandidates,
  saveCandidate,
  unsaveCandidate,
} from '@/lib/portal/candidates/saved-candidates';
import { z } from 'zod';

/**
 * GET    /api/portal/employer/saved-candidates - the company shortlist
 * POST   /api/portal/employer/saved-candidates - save a candidate (optionally with a note)
 * DELETE /api/portal/employer/saved-candidates?candidateId=... - remove from shortlist
 *
 * The company id always comes from the session; the candidate id is the only
 * thing a client supplies, and every operation is scoped to that company
 * inside the service. The `saved_candidates` plan feature is enforced there
 * too, before any write.
 */

const saveSchema = z
  .object({
    candidateId: z.string().uuid(),
    notes: z.string().max(2000).nullish(),
  })
  .strict();

export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);
    const limit = Math.min(Math.max(Number.parseInt(params.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0);
    return { items: await listSavedCandidates(company.id, { limit, offset }) };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const { company, user } = await requireCompanyContext();
      const input = parseWithSchema(saveSchema, await readJsonBody(req));
      const row = await saveCandidate({
        companyId: company.id,
        candidateId: input.candidateId,
        actorUserId: user.id,
        notes: input.notes,
      });
      return { item: row };
    },
    () => 201
  );
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const params = parseSearchParams(req);
    const candidateId = params.candidateId ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(candidateId)) {
      return { removed: false };
    }
    const removed = await unsaveCandidate({ companyId: company.id, candidateId });
    return { removed };
  });
}