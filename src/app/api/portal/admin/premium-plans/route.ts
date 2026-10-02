import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { createPremiumPlan, listAllPlansForAdmin } from '@/lib/portal/premium/entitlements';

const planSchema = z
  .object({
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullish(),
    // Integer minor units. The client never formats a price into a request.
    priceMinor: z.number().int().min(0),
    currency: z.string().length(3).optional(),
    billingPeriod: z.enum(['monthly', 'quarterly', 'yearly']),
    durationDays: z.number().int().min(1).max(1200),
    sortOrder: z.number().int().min(0).max(999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

/**
 * GET  /api/portal/admin/premium-plans - every plan, including retired
 * POST /api/portal/admin/premium-plans - create a plan
 *
 * Plan prices are commercial terms and live ONLY here, in the database. Nothing
 * in the client bundle knows a price, so terms can change without a deploy.
 *
 * `requireAdminUser()` runs first, so a candidate or employer can never read or
 * change what premium costs.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    return { items: await listAllPlansForAdmin() };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const admin = await requireAdminUser();
      const input = parseWithSchema(planSchema, await readJsonBody(req));

      return {
        plan: await createPremiumPlan({
          ...input,
          currency: input.currency ?? 'INR',
          adminUserId: admin.id,
        }),
      };
    },
    () => 201
  );
}
