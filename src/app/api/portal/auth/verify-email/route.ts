import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { verifyEmailSchema } from '@/app/api/portal/schemas';
import { completeEmailVerification } from '@/lib/auth/email-verification';

/**
 * POST /api/portal/auth/verify-email
 *
 * Consumes a single-use verification token. Unknown, expired and already-used
 * tokens all produce the same generic message, so the endpoint cannot be used
 * to test whether a token existed.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const body = await readJsonBody(req);
    const input = parseWithSchema(verifyEmailSchema, body);
    return completeEmailVerification(input.token);
  });
}
