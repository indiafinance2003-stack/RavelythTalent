import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { loginPortalUser, MAX_FAILED_LOGINS, registerPortalUser } from '@/lib/auth/portal/register';
import {
  completeEmailVerification,
  isEmailVerified,
  requireVerifiedEmail,
  sendEmailVerificationLink,
} from '@/lib/auth/email-verification';

import { dbFromRequest } from '@/lib/db/request';
import { users } from '@/lib/db/schema';
import {
  candidateProfiles,
  companies,
  employerProfiles,
  emailVerificationTokens,
} from '@/lib/db/portal-schema';
import { hashEmailVerificationToken } from '@/lib/auth/tokens';
/**
 * REAL database tests for portal authentication (test items 1-18).
 *
 * Password hashing is real Argon2id, tokens are really generated and stored
 * hashed, and every guard is exercised against PostgreSQL.
 */
describe('portal authentication (real database)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    installTestDatabase(db);
  });

  afterAll(async () => {
    restoreDatabase();
    await db.$client.close();
  });

  const PASSWORD = 'correct-horse-battery-staple';

  it('registers a candidate and creates their profile', async () => {
    await truncateAllTables(db);
    const result = await registerPortalUser({
      name: 'Jane Candidate',
      email: 'jane@example.com',
      password: PASSWORD,
      role: 'candidate',
    });

    expect(result.user.role).toBe('candidate');
    // The password is never stored in plaintext.
    const [row] = await db.select().from(users).where(eq(users.email, 'jane@example.com'));
    expect(row.passwordHash).not.toBe(PASSWORD);
    expect(row.emailVerifiedAt).toBeNull();

    // A profile is created so the candidate can build one immediately.
    const profiles = await db.select().from(candidateProfiles);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe('Jane Candidate');
  });

  it('registers an employer and creates a pending, unverified company', async () => {
    await truncateAllTables(db);
    const result = await registerPortalUser({
      name: 'Erin Employer',
      email: 'erin@corp.example',
      password: PASSWORD,
      role: 'employer',
      company: { name: 'Corp Industries', industry: 'Software' },
    });

    expect(result.user.role).toBe('employer');

    const companies_ = await db.select().from(companies);
    expect(companies_).toHaveLength(1);
    // A company is NEVER auto-verified at registration.
    expect(companies_[0].verificationStatus).toBe('pending');

    const profiles = await db.select().from(employerProfiles);
    expect(profiles).toHaveLength(1);
  });

  it('rejects a duplicate email', async () => {
    await truncateAllTables(db);
    await registerPortalUser({
      name: 'First',
      email: 'dupe@example.com',
      password: PASSWORD,
      role: 'candidate',
    });

    await expect(
      registerPortalUser({
        name: 'Second',
        email: 'dupe@example.com',
        password: PASSWORD,
        role: 'candidate',
      })
    ).rejects.toThrowError(/already exists/i);
  });

  it('rejects an unsupported role such as admin', async () => {
    await truncateAllTables(db);
    await expect(
      registerPortalUser({
        name: 'Sneaky',
        email: 'sneaky@example.com',
        password: PASSWORD,
        // A client claiming to be an admin is refused by the closed set.
        role: 'admin' as never,
      })
    ).rejects.toThrowError(/unsupported account type/i);

    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('requires a company name for an employer', async () => {
    await truncateAllTables(db);
    await expect(
      registerPortalUser({
        name: 'No Company',
        email: 'nocompany@example.com',
        password: PASSWORD,
        role: 'employer',
      })
    ).rejects.toThrowError(/company name is required/i);
  });

  it('logs in with correct credentials and records the sign-in', async () => {
    await truncateAllTables(db);
    await registerPortalUser({
      name: 'Login User',
      email: 'login@example.com',
      password: PASSWORD,
      role: 'candidate',
    });

    const result = await loginPortalUser({ email: 'login@example.com', password: PASSWORD });
    expect(result.user.email).toBe('login@example.com');
    expect(result.user.emailVerified).toBe(false);

    const [row] = await db.select().from(users).where(eq(users.email, 'login@example.com'));
    expect(row.lastLoginAt).not.toBeNull();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await truncateAllTables(db);
    await registerPortalUser({
      name: 'Login User',
      email: 'known@example.com',
      password: PASSWORD,
      role: 'candidate',
    });

    let wrongPasswordMessage = '';
    try {
      await loginPortalUser({ email: 'known@example.com', password: 'not-the-password' });
    } catch (error) {
      wrongPasswordMessage = (error as Error).message;
    }

    let unknownMessage = '';
    try {
      await loginPortalUser({ email: 'nobody@example.com', password: 'whatever-value' });
    } catch (error) {
      unknownMessage = (error as Error).message;
    }

    // Identical responses prevent account enumeration.
    expect(wrongPasswordMessage).toBe('Incorrect email or password.');
    expect(unknownMessage).toBe('Incorrect email or password.');
  });

  it('locks the account after repeated failures', async () => {
    await truncateAllTables(db);
    await registerPortalUser({
      name: 'Lock Me',
      email: 'lock@example.com',
      password: PASSWORD,
      role: 'candidate',
    });

    for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt += 1) {
      await expect(
        loginPortalUser({ email: 'lock@example.com', password: 'wrong-password' })
      ).rejects.toThrow();
    }

    // Even the CORRECT password is now refused while the lock holds.
    await expect(
      loginPortalUser({ email: 'lock@example.com', password: PASSWORD })
    ).rejects.toThrowError(/too many failed sign-in attempts/i);

    const [row] = await db.select().from(users).where(eq(users.email, 'lock@example.com'));
    expect(row.lockedUntil).not.toBeNull();
  });

  it('refuses a suspended account and explains why', async () => {
    await truncateAllTables(db);
    const { user } = await registerPortalUser({
      name: 'Suspended',
      email: 'suspended@example.com',
      password: PASSWORD,
      role: 'candidate',
    });

    await db
      .update(users)
      .set({ accountStatus: 'suspended', suspensionReason: 'policy breach' })
      .where(eq(users.id, user.id));

    // A specific message: the user must know the password is not the problem.
    await expect(
      loginPortalUser({ email: 'suspended@example.com', password: PASSWORD })
    ).rejects.toThrowError(/suspended/i);
  });

describe('email verification (real database)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    installTestDatabase(db);
  });

  afterAll(async () => {
    restoreDatabase();
    await db.$client.close();
  });

  /** Registers a user and returns the id, without sending any mail. */
  async function register(email: string): Promise<string> {
    const result = await registerPortalUser({
      name: 'Verify Me',
      email,
      password: 'correct-horse-battery-staple',
      role: 'candidate',
    });
    return result.user.id;
  }

  /**
   * Captures the verification link instead of sending it, so the test can
   * exercise the real token flow without an email provider. The raw token is
   * read from the URL, exactly as a user clicking the link would.
   */
  function captureSend() {
    const sent: Array<{ to: string; verificationUrl: string }> = [];
    return {
      sent,
      send: async (input: { to: string; verificationUrl: string }) => {
        sent.push({ to: input.to, verificationUrl: input.verificationUrl });
        return { delivered: true };
      },
    };
  }

  function tokenFrom(url: string): string {
    return new URL(url).searchParams.get('token') ?? '';
  }

  it('issues a hashed token and never stores the raw value', async () => {
    await truncateAllTables(db);
    const userId = await register('verify1@example.com');
    const capture = captureSend();

    const result = await sendEmailVerificationLink('verify1@example.com', { send: capture.send });
    expect(result.requested).toBe(true);
    expect(result.emailDelivered).toBe(true);
    expect(capture.sent).toHaveLength(1);

    const token = tokenFrom(capture.sent[0].verificationUrl);
    expect(token.length).toBeGreaterThan(20);

    const rows = await db.select().from(emailVerificationTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
    // Only the SHA-256 hash is persisted.
    expect(rows[0].tokenHash).toBe(hashEmailVerificationToken(token));
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it('verifies the address and refuses the token a second time', async () => {
    await truncateAllTables(db);
    await register('verify2@example.com');
    const capture = captureSend();
    await sendEmailVerificationLink('verify2@example.com', { send: capture.send });
    const token = tokenFrom(capture.sent[0].verificationUrl);

    expect(await isEmailVerified(await findUserId('verify2@example.com'))).toBe(false);
    await completeEmailVerification(token);
    expect(await isEmailVerified(await findUserId('verify2@example.com'))).toBe(true);

    // A replayed token is refused.
    await expect(completeEmailVerification(token)).rejects.toThrowError(
      /invalid or has expired/i
    );
  });

  it('rejects an expired token', async () => {
    await truncateAllTables(db);
    await register('verify3@example.com');
    const capture = captureSend();
    // Issue the token "yesterday" so it is already past its TTL.
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await sendEmailVerificationLink('verify3@example.com', {
      send: capture.send,
      now: () => past,
    });
    const token = tokenFrom(capture.sent[0].verificationUrl);

    await expect(completeEmailVerification(token)).rejects.toThrowError(
      /invalid or has expired/i
    );
  });

  it('invalidates an earlier link when a new one is requested', async () => {
    await truncateAllTables(db);
    await register('verify4@example.com');
    const first = captureSend();
    await sendEmailVerificationLink('verify4@example.com', { send: first.send });
    const oldToken = tokenFrom(first.sent[0].verificationUrl);

    const second = captureSend();
    await sendEmailVerificationLink('verify4@example.com', { send: second.send });
    const newToken = tokenFrom(second.sent[0].verificationUrl);

    // The newest link works, the old one does not.
    await completeEmailVerification(newToken);
    await expect(completeEmailVerification(oldToken)).rejects.toThrowError(
      /invalid or has expired/i
    );
  });

  it('gives the same response for an unknown email (no account enumeration)', async () => {
    await truncateAllTables(db);
    const capture = captureSend();
    const result = await sendEmailVerificationLink('nobody@example.com', { send: capture.send });

    expect(result.requested).toBe(true);
    // No email is sent, but the response shape is identical to a success.
    expect(capture.sent).toHaveLength(0);
  });

  it('reports an already verified address without sending again', async () => {
    await truncateAllTables(db);
    const userId = await register('verify5@example.com');
    const capture = captureSend();
    await sendEmailVerificationLink('verify5@example.com', { send: capture.send });
    await completeEmailVerification(tokenFrom(capture.sent[0].verificationUrl));

    const second = captureSend();
    const result = await sendEmailVerificationLink('verify5@example.com', { send: second.send });
    expect(result.alreadyVerified).toBe(true);
    expect(second.sent).toHaveLength(0);
    expect(userId).toBeTruthy();
  });

  it('enforces the verified-email requirement for a protected action', async () => {
    await truncateAllTables(db);
    const userId = await register('verify6@example.com');

    // Unverified: the guard blocks.
    await expect(requireVerifiedEmail(userId)).rejects.toThrowError(/verify your email/i);

    const capture = captureSend();
    await sendEmailVerificationLink('verify6@example.com', { send: capture.send });
    await completeEmailVerification(tokenFrom(capture.sent[0].verificationUrl));

    // Verified: the guard allows.
    await expect(requireVerifiedEmail(userId)).resolves.toBeUndefined();
  });
});

/** Resolves a registered user's id by email, for assertions. */
async function findUserId(email: string): Promise<string> {
  const { db } = dbFromRequest();
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row?.id ?? '';
}

});

