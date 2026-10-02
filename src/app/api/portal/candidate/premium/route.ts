import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import {
  cancelSubscription,
  getCandidateSubscription,
  listActivePlans,
  listCandidateEntitlements,
} from '@/lib/portal/premium/entitlements';

const cancelSchema = z.object({}).strict();

/**
 * GET  /api/portal/candidate/premium - plans, current subscription, entitlements
 * POST /api/portal/candidate/premium - cancel at period end
 *
 * Reading is open to any signed-in candidate; cancelling is a real state change.
 *
 * ACTIVATION IS DELIBERATELY ABSENT from this endpoint. A subscription may only
 * be activated from `activateSubscription`, which is reachable exclusively from a
 * verified payment path. Exposing a "subscribe" call here would let anyone grant
 * themselves premium entitlements for free.
 *
 * Prices are never hard-coded: every plan row is created by an admin and read
 * from the database, so commercial terms can change without a deploy.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();

    const [plans, subscription, entitlements] = await Promise.all([
      listActivePlans(),
      getCandidateSubscription(profile.id),
      listCandidateEntitlements(profile.id),
    ]);

    return { plans, subscription, entitlements };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    // Parsed purely to reject unexpected keys, keeping the body contract honest.
    parseWithSchema(cancelSchema, await readJsonBody(req));

    await cancelSubscription({ candidateId: profile.id });

    return { subscription: await getCandidateSubscription(profile.id) };
  });
}
