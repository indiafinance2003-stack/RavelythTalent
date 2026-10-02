import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { destroySession } from '@/lib/auth/session';

/**
 * POST /api/portal/auth/logout
 *
 * Deletes the server-side session row and clears the cookie. Logging out twice
 * is harmless.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await destroySession();
    return { message: 'Signed out.' };
  });
}
