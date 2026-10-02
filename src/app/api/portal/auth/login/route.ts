import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { loginSchema } from '@/app/api/portal/schemas';
import { loginPortalUser } from '@/lib/auth/portal/register';
import { createSession } from '@/lib/auth/session';
import { checkAuthRateLimit, getLoginRateLimiter, loginKey } from '@/lib/auth/rate-limit';

/**
 * POST /api/portal/auth/login
 *
 * Rate limited per client identity AND per email, so a distributed attack on
 * one account is throttled as well as a single-client burst.
 *
 * The service returns an identical error for an unknown email and a wrong
 * password, so this endpoint cannot be used to discover registered addresses.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const body = await readJsonBody(req);
    const input = parseWithSchema(loginSchema, body);

    checkAuthRateLimit(
      getLoginRateLimiter(),
      loginKey(req, input.email),
      'Too many sign-in attempts. Please try again later.'
    );

    const result = await loginPortalUser({
      email: input.email,
      password: input.password,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    // A fresh session is issued on every successful sign-in.
    await createSession(result.user.id);

    return { user: result.user };
  });
}
