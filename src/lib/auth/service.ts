import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidateProfiles,
  companies,
  companyMembers,
  companyVerificationDocuments,
  emailVerificationTokens,
  oauthAccounts,
  passwordResetTokens,
  sessions,
  users,
} from "@/lib/db/schema";
import { ConflictError, AppError, NotFoundError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, sha256Hex } from "@/lib/auth/crypto";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { emailVerificationEmail, passwordResetEmail } from "@/lib/email/templates/auth";
import { companyVerificationSubmittedEmail } from "@/lib/email/templates/recruiter";
import { appUrl } from "@/lib/email/urls";
import { slugify } from "@/lib/utils";
import {
  assertCompanyIdentityAvailable,
  normalizeCompanyName,
  normalizeContactPhone,
  normalizeWebsiteDomain,
} from "@/lib/company-identity";
import { isDisposableEmail } from "@/lib/auth/disposable-email";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

/** Appends -2, -3 ... until the slug is free. */
export async function uniqueCompanySlug(name: string): Promise<string> {
  const base = slugify(name) || "company";
  let candidate = base;
  for (let i = 2; i < 50; i += 1) {
    const clash = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, candidate))
      .limit(1);
    if (!clash.at(0)) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/* -------------------------------------------------------------------------- */
/* Email verification                                                         */
/* -------------------------------------------------------------------------- */

export async function issueEmailVerification(
  user: { id: string; email: string; fullName: string },
  options: { isResend?: boolean } = {},
): Promise<void> {
  const token = generateToken(32);

  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));

  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    email: user.email,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });

  const brand = await getEmailBrand();
  const url = appUrl(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);

  if (options.isResend) {
    const { emailVerificationResentEmail } = await import("@/lib/email/templates/auth");
    await queueRenderedEmail({
      to: user.email,
      toName: user.fullName,
      templateKey: "email_verification_resent",
      rendered: emailVerificationResentEmail({ name: user.fullName, url, brand }),
      metadata: { userId: user.id },
    });
    return;
  }

  await queueRenderedEmail({
    to: user.email,
    toName: user.fullName,
    templateKey: "email_verification",
    rendered: emailVerificationEmail({ name: user.fullName, url, brand }),
    metadata: { userId: user.id },
  });
}

/** Marks the email verified. Returns true when a token was consumed. */
export async function consumeEmailVerificationToken(token: string): Promise<boolean> {
  const tokenHash = sha256Hex(token);
  const rows = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.usedAt),
        sql`${emailVerificationTokens.expiresAt} > now()`,
      ),
    )
    .limit(1);

  const row = rows.at(0);
  if (!row) return false;

  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, row.id));

  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, row.userId));

  return true;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

export async function registerUser(input: RegisterInput): Promise<string> {
  if (input.role === "recruiter" && isDisposableEmail(input.email)) {
    throw new AppError(
      "Use a work or personal email address that is not a disposable mailbox to register a company.",
      422,
      "disposable_email",
    );
  }
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing.at(0)) {
    throw new ConflictError(
      "An account with this email address already exists. Try signing in instead.",
    );
  }

  const companyIdentity =
    input.role === "recruiter" && input.companyName
      ? {
          normalizedName: normalizeCompanyName(input.companyName),
          websiteDomain: normalizeWebsiteDomain(input.companyWebsite),
          normalizedContactPhone: normalizeContactPhone(input.phone),
        }
      : null;
  if (companyIdentity) await assertCompanyIdentityAvailable(companyIdentity);

  const passwordHash = await hashPassword(input.password);

  const inserted = await db
    .insert(users)
    .values({
      email: input.email,
      fullName: input.fullName,
      phone: input.phone ?? null,
      passwordHash,
      role: input.role,
    })
    .returning({ id: users.id, email: users.email, fullName: users.fullName });

  const user = inserted[0]!;

  // Every job seeker gets a profile row so the rest of the app can assume it.
  if (input.role === "job_seeker") {
    await db.insert(candidateProfiles).values({ userId: user.id });
  }

  if (input.role === "recruiter" && input.companyName) {
    const slug = await uniqueCompanySlug(input.companyName);
    const identity = companyIdentity!;
    const company = await db
      .insert(companies)
      .values({
        ownerUserId: user.id,
        name: input.companyName,
        normalizedName: identity.normalizedName,
        slug,
        website: input.companyWebsite || null,
        websiteDomain: identity.websiteDomain,
        contactEmail: user.email,
        contactPhone: input.phone || null,
        normalizedContactPhone: identity.normalizedContactPhone,
        status: "pending",
      })
      .returning({ id: companies.id, name: companies.name });

    await db.insert(companyMembers).values({
      companyId: company[0]!.id,
      userId: user.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });

    // Placeholder verification record - the real document is uploaded by the
    // owner from /recruiter/company/verification.
    await db.insert(companyVerificationDocuments).values({
      companyId: company[0]!.id,
      docType: "company_registration",
      originalName: "pending",
      storagePath: "pending",
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      status: "pending",
    });

    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: user.email,
      toName: user.fullName,
      templateKey: "company_verification_submitted",
      rendered: companyVerificationSubmittedEmail({
        ownerName: user.fullName,
        companyName: company[0]!.name,
        brand,
      }),
      metadata: { userId: user.id, companyId: company[0]!.id },
    });
  }

  await issueEmailVerification(user);
  return user.id;
}

/* -------------------------------------------------------------------------- */
/* Login                                                                      */
/* -------------------------------------------------------------------------- */

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; code: string; message: string };

/**
 * A REAL argon2id hash of a random throwaway string, so a login attempt for an
 * unknown email still performs a full, comparable verification. Without this,
 * "no such user" would return measurably faster than "wrong password".
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$nnMIE8YvwnhJnba848E5Hg$Y6rM+fR3fQQ75Q1Ah7trl0/VASJXLmJOVRksHs3O7Fo";

export async function authenticate(input: LoginInput): Promise<LoginResult> {
  const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  const user = rows.at(0);

  if (!user) {
    // Always perform a hash comparison so a missing account is not faster.
    await verifyPassword(DUMMY_HASH, input.password);
    return {
      ok: false,
      code: "invalid_credentials",
      message: "Email or password is incorrect.",
    };
  }

  if (user.status === "suspended") {
    return {
      ok: false,
      code: "account_suspended",
      message: "This account has been suspended. Please contact support.",
    };
  }
  if (user.status === "deactivated") {
    return {
      ok: false,
      code: "account_deactivated",
      message: "This account is no longer active.",
    };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      ok: false,
      code: "account_locked",
      message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_LOGINS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return {
      ok: false,
      code: "invalid_credentials",
      message: "Email or password is incorrect.",
    };
  }

  if (!user.emailVerifiedAt) {
    return {
      ok: false,
      code: "email_unverified",
      message: "Please verify your email address before signing in.",
    };
  }

  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { ok: true, userId: user.id };
}

export async function getUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const user = rows.at(0);
  if (!user) throw new NotFoundError("User not found.");
  return user;
}

/* -------------------------------------------------------------------------- */
/* Google OAuth linking                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Signs the user in with a verified Google identity.
 *
 * 1. Known Google identity  -> use that account.
 * 2. Unknown identity, known email -> link the Google account to it
 *    (no duplicate account is created).
 * 3. Completely new -> create a verified job-seeker account.
 */
export async function signInWithGoogle(profile: {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
}): Promise<{ userId: string; created: boolean }> {
  const linked = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, "google"),
        eq(oauthAccounts.providerAccountId, profile.id),
      ),
    )
    .limit(1);

  if (linked.at(0)) {
    return { userId: linked.at(0)!.userId, created: false };
  }

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  if (existingUser.at(0)) {
    const user = existingUser.at(0)!;
    await db.insert(oauthAccounts).values({
      userId: user.id,
      provider: "google",
      providerAccountId: profile.id,
      email: profile.email,
    });
    // A Google-verified email also verifies the local account.
    if (!user.emailVerifiedAt) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }
    return { userId: user.id, created: false };
  }

  const inserted = await db
    .insert(users)
    .values({
      email: profile.email,
      fullName: profile.name,
      role: "job_seeker",
      // Google asserts email ownership, so this counts as verified.
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });

  const userId = inserted[0]!.id;

  await db.insert(oauthAccounts).values({
    userId,
    provider: "google",
    providerAccountId: profile.id,
    email: profile.email,
  });

  await db.insert(candidateProfiles).values({ userId });

  return { userId, created: true };
}

/* -------------------------------------------------------------------------- */
/* Password reset                                                             */
/* -------------------------------------------------------------------------- */

/** Always succeeds from the caller's point of view (no user enumeration). */
export async function requestPasswordReset(email: string): Promise<void> {
  const rows = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const user = rows.at(0);
  if (!user) return;

  const token = generateToken(32);
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  const brand = await getEmailBrand();
  await queueRenderedEmail({
    to: user.email,
    toName: user.fullName,
    templateKey: "password_reset",
    rendered: passwordResetEmail({
      name: user.fullName,
      url: appUrl(`/reset-password?token=${encodeURIComponent(token)}`),
      brand,
    }),
    metadata: { userId: user.id },
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const tokenHash = sha256Hex(token);
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        sql`${passwordResetTokens.expiresAt} > now()`,
      ),
    )
    .limit(1);

  const row = rows.at(0);
  if (!row) {
    throw new AppError(
      "This password reset link is invalid or has expired. Please request a new one.",
      400,
      "invalid_reset_token",
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, row.userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  // Invalidate every other session.
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));

  const user = await getUserById(row.userId);
  const brand = await getEmailBrand();
  const { passwordChangedEmail } = await import("@/lib/email/templates/auth");
  await queueRenderedEmail({
    to: user.email,
    toName: user.fullName,
    templateKey: "password_changed",
    rendered: passwordChangedEmail({
      name: user.fullName,
      at: new Date().toLocaleString("en-IN"),
      brand,
    }),
    metadata: { userId: user.id },
  });
}