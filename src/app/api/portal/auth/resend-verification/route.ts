import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { resendVerificationSchema } from '@/app/api/portal/schemas';
import { sendEmailVerificationLink } from '@/lib/auth/email-verification';
import { config } from '@/lib/config';
import { createRateLimiter } from '@/lib/security/rate-limit/rate-limiter';
import { checkRateLimit } from '@/lib/security/rate-limit/rate-limiter';
import { clientIdentityFromRequest } from '@/lib/portal/request-identity';

/**
 * POST /api/portal/auth/resend-verification
 *
 * Issuing a NEW link invalidates every previous unused token for that account,
 * so only the most recent email can verify the address.
 *
 * The response is deliberately non-committal: an unknown address, an already
 * verified address and a real resend all return the same payload, which keeps
 * this endpoint from enumerating accounts.
 */
let resendLimiter: ReturnType<typeof createRateLimiter> | undefined;

function getResendLimiter() {
  if (!resendLimiter) {
    resendLimiter = createRateLimiter(
      config.EMAIL_VERIFICATION_RESEND_RATE_LIMIT_WINDOW_MS,
      config.EMAIL_VERIFICATION_RESEND_RATE_LIMIT_MAX
    );
  }
  return resendLimiter;
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const body = await readJsonBody(req);
    const input = parseWithSchema(resendVerificationSchema, body);

    // Throttle per client identity so one device cannot spam many addresses.
    checkRateLimit(
      getResendLimiter(),
      `verify-resend:${clientIdentityFromRequest(req)}`,
    );

    const result = await sendEmailVerificationLink(input.email);

    return {
      message:
        'If that address needs verification, a new link has been sent. The link expires in 24 hours.',
      emailDelivered: result.emailDelivered,
    };
  });
}
