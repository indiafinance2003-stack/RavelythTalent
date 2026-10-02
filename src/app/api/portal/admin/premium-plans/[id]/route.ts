import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { updatePremiumPlan } from '@/lib/portal/premium/entitlements';

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullish(),
    priceMinor: z.number().int().min(0).optional(),
    billingPeriod: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    durationDays: z.number().int().min(1).max(1200).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    // Deactivating is how a plan is retired: it disappears from the candidate's
    // list immediately and can no longer be purchased, while existing
    // subscriptions are untouched.
    isActive: z.boolean().optional(),
  })
  .strict();

/** PATCH /api/portal/admin/premium-plans/[id] */
export async function PATCH(req: NextRequest, context: RouteContext): Promise<Response> {
  return handleApi(req, async () => {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const input = parseWithSchema(patchSchema, await readJsonBody(req));

    return {
      plan: await updatePremiumPlan({
        planId: id,
        ...input,
        adminUserId: admin.id,
      }),
    };
  });
}
