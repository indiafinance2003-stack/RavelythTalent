import 'server-only';
import { eq, or } from 'drizzle-orm';
import { config } from '@/lib/config';
import { dbFromRequest } from '@/lib/db/request';
import { users, type UserRow } from '@/lib/db/schema';
import { getDummyPasswordHash, hashPassword, verifyPassword } from '@/lib/auth/password';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { logger } from '@/lib/logging/logger';
import { isAdminRole } from '@/lib/portal/authz';
import { recordPortalAudit } from '@/lib/portal/audit';

/**
 * Private admin console: bootstrap and username sign-in.
 *
 * WHY A USERNAME. The console's existence must not be tied to a discoverable
 * mailbox, so the administrator signs in with `ADMIN_USERNAME` (a name, not a
 * secret) rather than an email address. Ordinary candidate and employer
 * accounts have `users.username IS NULL`, so the column is useless to them and
 * its unique index makes two accounts claiming the admin handle impossible.
 *
 * THE CREDENTIAL NEVER LIVES IN SOURCE. It comes from `ADMIN_PASSWORD_HASH`
 * (an Argon2id hash) or `ADMIN_PASSWORD` (hashed once when the account is
 * bootstrapped). Nothing here writes the password to a log or a response.
 *
 * BOOTSTRAP IS IDEMPOTENT. Running it again reconciles the account: password
 * rotation through the environment takes effect and the handle and role are
 * re-asserted, so a deployment never needs a manual database fix.
 */

function adminEmail(): string {
  return config.ADMIN_EMAIL || 'admin@ravelyth.invalid';
}

/** Resolves the configured credential to an Argon2id hash. */
async function configuredPasswordHash(): Promise<string | null> {
  const provided = config.ADMIN_PASSWORD_HASH.trim();
  if (provided) return provided;
  if (config.ADMIN_PASSWORD.length > 0) return await hashPassword(config.ADMIN_PASSWORD);
  return null;
}

/**
 * Finds or creates the bootstrap admin account and reconciles its credential.
 *
 * Returns false when admin bootstrap is not configured (no password in the
 * environment), which is the correct state for a deployment that manages its
 * administrators manually.
 */
export async function ensureAdminBootstrap(): Promise<boolean> {
  if (!config.ADMIN_BOOTSTRAP_ENABLED) return false;

  const passwordHash = await configuredPasswordHash();
  if (!passwordHash) return false;

  const { db } = dbFromRequest();
  const now = new Date();
  const username = config.ADMIN_USERNAME;
  const email = adminEmail();

  // Match on either handle: an account created before the username column
  // existed was found by email, one created afterwards by username.
  const [existing] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name: username,
        username,
        role: 'admin',
        status: 'active',
        accountStatus: 'active',
        emailVerifiedAt: now,
      })
      .returning({ id: users.id });

    if (created) {
      await recordPortalAudit({
        action: 'user_role_changed',
        actorUserId: created.id,
        description: `Admin account bootstrapped for '${username}'`,
        metadata: { username, role: 'admin' },
      });
      logger.info('Admin account bootstrapped', { username });
    }
    return true;
  }

  // Reconcile: rotation of the environment credential, the handle and the role
  // all take effect here rather than requiring a manual database fix.
  const patch: Partial<UserRow> = {};
  if (existing.passwordHash !== passwordHash) patch.passwordHash = passwordHash;
  if (existing.username !== username) patch.username = username;
  if (existing.role !== 'admin' && existing.role !== 'owner') patch.role = 'admin';
  if (existing.status !== 'active') patch.status = 'active';
  if (existing.accountStatus === 'pending_deletion') patch.accountStatus = 'active';

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = now;
    await db.update(users).set(patch).where(eq(users.id, existing.id));
    logger.info('Admin account reconciled by bootstrap', { username });
  }
  return true;
}

function invalidAdminCredentials(): AppError {
  // One generic message: this endpoint must not confirm whether a handle exists.
  return new AppError(
    AppErrorCode.AUTH_INVALID_CREDENTIALS,
    'Invalid administrator credentials.',
    401
  );
}

/**
 * Signs the administrator in by USERNAME.
 *
 * Mirrors `loginPortalUser`'s protections — timing-equalised unknown handle,
 * lockout on repeated failure, identical failure message — with one addition:
 * the account must hold an ADMIN role, and a non-admin account that somehow
 * claims the handle is refused with the same generic error.
 */
export async function loginAdminWithUsername(input: {
  username: string;
  password: string;
  ipAddress?: string | null;
  now?: Date;
}): Promise<{ user: Pick<UserRow, 'id' | 'email' | 'name' | 'username' | 'role'> }> {
  const now = input.now ?? new Date();

  // The configured account must exist before it can be verified: a fresh
  // deployment signs in for the first time without a manual seeding step.
  await ensureAdminBootstrap();

  const { db } = dbFromRequest();
  const [user] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);

  if (!user) {
    // Equalise timing so a missing handle is indistinguishable.
    await verifyPassword(await getDummyPasswordHash(), input.password);
    throw invalidAdminCredentials();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    logger.warn('Admin sign-in refused: account temporarily locked', { userId: user.id });
    throw new AppError(
      AppErrorCode.AUTH_INVALID_CREDENTIALS,
      'Too many failed sign-in attempts. Please try again later.',
      401
    );
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid || !isAdminRole(user.role)) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= 5;
    await db
      .update(users)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + 15 * 60_000) : null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
    logger.warn('Failed admin sign-in', { userId: user.id, locked: shouldLock });
    throw invalidAdminCredentials();
  }

  if (user.accountStatus === 'suspended' || user.status !== 'active') {
    logger.warn('Admin sign-in refused: account inactive', { userId: user.id });
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This account has been suspended. Please contact support.',
      403
    );
  }

  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
      lastLoginIp: input.ipAddress ?? null,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await recordPortalAudit({
    action: 'admin_login',
    actorUserId: user.id,
    description: 'Administrator signed in with username',
    metadata: { userId: user.id, role: user.role, username: user.username },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
    },
  };
}
