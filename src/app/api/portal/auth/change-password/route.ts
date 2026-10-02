import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { changePasswordSchema } from '@/app/api/portal/schemas';
import { requirePortalUser } from '@/lib/portal/auth-context';
import { changePasswordForUser } from '@/lib/auth/portal/change-password';
import { getCurrentSessionId } from '@/lib/auth/session';
import { sendPasswordChanged } from '@/lib/email/transactional/dispatch';
import { logger } from '@/lib/logging/logger';

/**
 * POST /api/portal/auth/change-password
 *
 * Changes the signed-in user's password. The CURRENT password is required, so a
 * hijacked session alone cannot take over the account.
 *
 * On success every OTHER session for the account is revoked. The caller's own
 * session is preserved so the user is not logged out of the device they are on.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requirePortalUser();
    const body = await readJsonBody(req);
    const input = parseWithSchema(changePasswordSchema, body);

    const sessionId = await getCurrentSessionId();

    const result = await changePasswordForUser({
      userId: user.id,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      currentSessionId: sessionId,
    });

    // Confirmation is best-effort: a mail outage must not fail the change,
    // which has already been committed.
    const sent = await sendPasswordChanged({
      to: user.email,
      recipientName: user.name,
      changedAtIso: new Date().toISOString(),
    });
    if (!sent.delivered) {
      logger.info('Password changed but the confirmation email was not delivered', {
        reason: sent.reason,
      });
    }

    return {
      changed: true,
      // Not a security leak: it tells the UI how many other devices signed out.
      otherSessionsRevoked: result.otherSessionsRevoked,
    };
  });
}
