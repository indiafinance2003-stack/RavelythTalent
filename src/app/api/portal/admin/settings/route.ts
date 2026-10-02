import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { requireAdminUser } from '@/lib/portal/auth-context';
import {
  listPlatformSettings,
  setPlatformSetting,
  PLATFORM_SETTING_KEYS,
} from '@/lib/portal/admin/users';

/**
 * GET  /api/portal/admin/settings - the current platform settings
 * PUT  /api/portal/admin/settings - change one setting
 *
 * The key set is CLOSED and enumerated here, so an admin console cannot invent
 * a setting the rest of the platform does not read. A value is still only a
 * preference: nothing here is a security control, because a setting that
 * gated access would be a way to disable that control from the browser.
 */
const settingSchema = z
  .object({
    key: z.enum(PLATFORM_SETTING_KEYS),
    // Deliberately loose: the shape differs per key (booleans, a day count, a
    // free-text announcement) and is validated by the reader that uses it.
    value: z.unknown(),
  })
  .strict();

export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    // The allowed key set travels with the values, so the console can render
    // the form without hard-coding the list in two places.
    return { items: await listPlatformSettings(), keys: PLATFORM_SETTING_KEYS };
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const admin = await requireAdminUser();
    const body = await readJsonBody(req);
    const input = parseWithSchema(settingSchema, body);

    await setPlatformSetting({
      key: input.key,
      value: input.value,
      adminUserId: admin.id,
    });

    // Re-read rather than echoing the input, so the console shows what was
    // actually stored instead of what was requested.
    return { items: await listPlatformSettings() };
  });
}
