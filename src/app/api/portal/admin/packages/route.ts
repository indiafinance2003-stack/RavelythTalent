import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/portal/auth-context';
import {
  createJobPackage,
  listJobPackages,
  listPlatformSettings,
  setPlatformSetting,
  updateJobPackage,
} from '@/lib/portal/admin/users';

const packageSchema = z
  .object({
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullish(),
    // Integer minor units. The schema rejects a float before the service does.
    priceMinor: z.number().int().min(0),
    currency: z.string().length(3).optional(),
    credits: z.number().int().min(1).max(1000),
    validityDays: z.number().int().min(1).max(3650),
    status: z.enum(['active', 'inactive']).optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    features: z
      .array(
        z.object({
          key: z.string().min(1).max(60),
          value: z.string().max(200).nullish(),
          description: z.string().max(500).nullish(),
        })
      )
      .max(20)
      .optional(),
  })
  .strict();

const updateSchema = packageSchema.partial().extend({ packageId: z.string().uuid() });

const settingSchema = z
  .object({
    key: z.enum([
      'job_approval_required',
      'job_credit_required',
      'job_default_validity_days',
      'require_verified_email_to_apply',
      'platform_announcement',
    ]),
    value: z.unknown(),
  })
  .strict();

/**
 * GET  /api/portal/admin/packages - the job package catalogue + settings
 * POST /api/portal/admin/packages - create a package
 * PUT  /api/portal/admin/packages - update a package or a platform setting
 *
 * All package PRICING is admin-managed data. Nothing in the codebase hard-codes a
 * price, credit count or validity period, so the commercial terms can be finalised
 * without a code change.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);
    return {
      packages: await listJobPackages({ includeInactive: params.includeInactive === '1' }),
      settings: await listPlatformSettings(),
    };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const admin = await requireAdminUser();
      const body = await readJsonBody(req);
      const input = parseWithSchema(packageSchema, body);
      return { package: await createJobPackage(input, admin.id) };
    },
    () => 201
  );
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const admin = await requireAdminUser();
    const body = await readJsonBody(req);

    // A settings write is identified by its own schema shape.
    if (typeof (body as { key?: unknown }).key === 'string') {
      const input = parseWithSchema(settingSchema, body);
      await setPlatformSetting({ key: input.key, value: input.value, adminUserId: admin.id });
      return { settings: await listPlatformSettings() };
    }

    const input = parseWithSchema(updateSchema, body);
    return { package: await updateJobPackage(input.packageId, input, admin.id) };
  });
}
