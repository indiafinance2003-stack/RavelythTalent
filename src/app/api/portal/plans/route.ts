import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { listRecruiterPlans } from '@/lib/portal/recruiter-plans/service';

/**
 * GET /api/portal/plans - the public recruiter plan catalogue.
 *
 * Read-only and unauthenticated: the pricing page must show what the platform
 * actually sells, from the same rows checkout charges against, rather than a
 * hard-coded copy that can drift away from reality.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const items = await listRecruiterPlans();
    return { items };
  });
}