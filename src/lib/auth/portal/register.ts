import 'server-only';
import { eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { users, type UserRow } from '@/lib/db/schema';
import { companies, employerProfiles } from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { hashPassword, verifyPassword, getDummyPasswordHash } from '@/lib/auth/password';
import { logger } from '@/lib/logging/logger';
import { recordPortalAudit } from '@/lib/portal/audit';
import { ensureCandidateProfile } from '@/lib/portal/candidates/profile';

/**
 * Ravelyth Talent authentication (see §15).
 *
 * What this layer guarantees:
 *  - The role is chosen from a CLOSED SET by the caller and validated here. A
 *    client cannot post `role: "admin"` and have it honoured; the set simply
 *    does not contain an admin value.
 *  - Duplicate emails are rejected by the unique index, and the race is handled
 *    by translating the DB error rather than by a check-then-insert.
 *  - A suspended account cannot sign in, and its existing sessions stop
 *    resolving because session lookup requires account_status = 'active'.
 *  - Repeated failures lock the account for a cooling-off period (brute-force
 *    protection) in addition to the per-IP/per-email rate limiter.
 *  - Login answers identically for "no such account" and "wrong password".
 */

export const PORTAL_REGISTER_ROLES = ['candidate', 'employer'] as const;
export type PortalRegisterRole = (typeof PORTAL_REGISTER_ROLES)[number];

/** Progressive lockout: 5 failures locks the account for 15 minutes. */
export const MAX_FAILED_LOGINS = 5;
export const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: PortalRegisterRole;
  /** Employer only: creates the company the user acts for. */
  company?: {
    name: string;
    website?: string | null;
    industry?: string | null;
    companySize?: string | null;
    location?: string | null;
  };
}

export interface RegisterResult {
  user: { id: string; email: string; name: string; role: string };
}

/**
 * Registers a candidate or employer.
 *
 * The role is validated against a closed set. An employer MUST supply a company
 * name; a candidate must not.
 */
export async function registerPortalUser(input: RegisterInput): Promise<RegisterResult> {
  if (!PORTAL_REGISTER_ROLES.includes(input.role)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported account type.');
  }
  if (input.role === 'employer' && !input.company?.name?.trim()) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'A company name is required to create an employer account.'
    );
  }
  if (input.role === 'candidate' && input.company) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'A company is only accepted for an employer account.'
    );
  }

  const passwordHash = await hashPassword(input.password);
  const { db } = dbFromRequest();

  let user: UserRow;
  try {
    const [created] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash,
        // The role comes from the validated closed set above.
        role: input.role,
        status: 'active',
        accountStatus: 'active',
      })
      .returning();
    user = created;
  } catch (error) {
    // 23505 = unique violation: the email was registered concurrently.
    if (
      error &&
      typeof error === 'object' &&
      (error as { cause?: { code?: string } }).cause?.code === '23505'
    ) {
      throw new AppError(
        AppErrorCode.EMAIL_TAKEN,
        'An account with this email already exists.',
        409
      );
    }
    throw error;
  }

  if (input.role === 'candidate') {
    await ensureCandidateProfile({ userId: user.id, fullName: input.name });
  } else if (input.company) {
    const [company] = await db
      .insert(companies)
      .values({
        name: input.company.name.trim().slice(0, 160),
        slug: `${input.company.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 50)}-${Date.now().toString(36)}`,
        // Never auto-verified.
        verificationStatus: 'pending',
        website: input.company.website ?? null,
        industry: input.company.industry ?? null,
        companySize: input.company.companySize ?? null,
        location: input.company.location ?? null,
        authorizedContactName: input.name,
        authorizedContactEmail: input.email,
      })
      .returning();

    await db.insert(employerProfiles).values({
      userId: user.id,
      companyId: company.id,
      isPrimaryContact: true,
    });
  }

  await recordPortalAudit({
    action: 'company_created',
    actorUserId: user.id,
    description: `Portal account registered: ${input.role}`,
    metadata: { userId: user.id, role: input.role },
  });

  logger.info('Portal user registered', { userId: user.id, role: input.role });

  return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export interface LoginResult {
  user: { id: string; email: string; name: string; role: string; emailVerified: boolean };
}

/**
 * Verifies credentials for a portal account.
 *
 * Security properties:
 *  - The failure message is IDENTICAL for an unknown email and a wrong
 *    password, so the endpoint cannot be used to enumerate accounts.
 *  - An unknown email still performs a dummy Argon2 verification, keeping the
 *    response time roughly constant either way.
 *  - A suspended account is refused explicitly, because the user needs to know
 *    WHY they cannot sign in (an incorrect-credentials error would send them in
 *    circles resetting a password that is fine).
 *  - Repeated failures increment a counter and lock the account for a cooling-off
 *    period, in addition to the per-IP/per-email rate limiter.
 */
export async function loginPortalUser(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
  now?: Date;
}): Promise<LoginResult> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    // Equalise timing so a missing account is indistinguishable.
    await verifyPassword(await getDummyPasswordHash(), input.password);
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    logger.warn('Login refused: account temporarily locked', { userId: user.id });
    throw new AppError(
      AppErrorCode.AUTH_INVALID_CREDENTIALS,
      'Too many failed sign-in attempts. Please try again later.',
      401
    );
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_LOGINS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: attempts,
        // Lock on the threshold; the counter resets once a sign-in succeeds.
        lockedUntil: shouldLock ? new Date(now.getTime() + ACCOUNT_LOCK_MS) : null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    logger.warn('Failed portal sign-in', { userId: user.id, locked: shouldLock });
    throw invalidCredentials();
  }

  if (user.accountStatus === 'suspended') {
    logger.warn('Login refused: account suspended', { userId: user.id });
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This account has been suspended. Please contact support.',
      403
    );
  }

  if (user.status !== 'active') {
    throw invalidCredentials();
  }

  // Success: clear the failure counter and record the sign-in.
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
    description: 'Portal sign-in',
    metadata: { userId: user.id, role: user.role },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    },
  };
}

/** One generic message for every credential failure. */
function invalidCredentials(): AppError {
  return new AppError(
    AppErrorCode.AUTH_INVALID_CREDENTIALS,
    'Incorrect email or password.',
    401
  );
}
