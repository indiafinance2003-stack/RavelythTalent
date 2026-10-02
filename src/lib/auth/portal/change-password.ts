import 'server-only';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { passwordResetTokens, sessions, users } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';

/**
 * Authenticated password change.
 *
 * Distinct from the password RESET flow: here the caller is already signed in
 * and must prove they know the CURRENT password, so a stolen session cookie on
 * its own can never lock the real owner out of their account.
 *
 * Security properties, all inside ONE transaction:
 *  - The current password is verified against the stored Argon2id hash.
 *  - Every OTHER session for the account is destroyed, so a session stolen on
 *    another device loses access the instant the owner changes their password.
 *  - Outstanding password-reset tokens are consumed, because a reset link issued
 *    before the change must not remain usable afterwards.
 *  - The failed-login counter and lockout are cleared, so an owner who was locked
 *    out by an attacker can regain access once they change their password.
 */

export async function changePasswordForUser(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  /** Session performing the change; this one is preserved. */
  currentSessionId: string | null;
}): Promise<{ otherSessionsRevoked: number }> {
  const { db } = dbFromRequest();

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested account was not found.', 404);
  }

  const matches = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!matches) {
    // No hint about which half was wrong, and no account enumeration.
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Your current password is incorrect.', 400);
  }

  const newHash = await hashPassword(input.newPassword);

  const otherSessionsRevoked = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: newHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId));

    // Destroy every session except the caller's own.
    const sessionFilter =
      input.currentSessionId === null
        ? eq(sessions.userId, input.userId)
        : and(
            eq(sessions.userId, input.userId),
            ne(sessions.id, input.currentSessionId)
          );

    const doomed = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(sessionFilter);

    if (doomed.length > 0) {
      await tx.delete(sessions).where(sessionFilter);
    }

    // Consume any outstanding reset link so it cannot be used after the change.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(eq(passwordResetTokens.userId, input.userId), isNull(passwordResetTokens.usedAt))
      );

    return doomed.length;
  });

  // Audit is written after the transaction commits.
  await recordPortalAudit({
    action: 'user_password_changed',
    actorUserId: input.userId,
    description: 'Password changed by the account owner',
    metadata: { userId: input.userId, otherSessionsRevoked },
  });

  return { otherSessionsRevoked };
}
