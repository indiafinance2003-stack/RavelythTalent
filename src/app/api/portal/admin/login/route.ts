import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { loginAdminWithUsername } from '@/lib/auth/portal/admin-bootstrap';
import { createSession } from '@/lib/auth/session';
import { checkAuthRateLimit, getLoginRateLimiter, loginKey } from '@/lib/auth/rate-limit';

/**
 * POST /api/portal/admin/login
 *
 * The administrator signs in with a USERNAME, not an email address: the
 * console's existence is not tied to a discoverable mailbox, and ordinary
 * accounts have no username to sign in with.
 *
 * Rate limited per client identity AND per handle, failures are lockout-
 * counted, and unknown-handle / wrong-password / non-admin-account all return
 * the identical message so the endpoint confirms nothing.
 */
const adminLoginSchema = z
  .object({
    username: z.string().min(1).max(80),
    password: z.string().min(1).max(200),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const body = await readJsonBody(req);
    const input = parseWithSchema(adminLoginSchema, body);

    checkAuthRateLimit(
      getLoginRateLimiter(),
      loginKey(req, `admin:${input.username.toLowerCase()}`),
      'Too many sign-in attempts. Please try again later.'
    );

    const result = await loginAdminWithUsername({
      username: input.username,
      password: input.password,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    // A fresh session is issued on every successful sign-in.
    await createSession(result.user.id);

    return { user: result.user };
  });
}