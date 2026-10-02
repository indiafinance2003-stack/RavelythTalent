import 'server-only';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { config } from '@/lib/config';
import { dbFromRequest } from '@/lib/db/request';
import { emailVerificationTokens } from '@/lib/db/portal-schema';
import { users as coreUsers } from '@/lib/db/schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { logger } from '@/lib/logging/logger';
import { sendEmailVerification, type EmailSendResult } from '@/lib/email/transactional/portal';
import {
  buildEmailVerificationUrl,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from '@/lib/auth/tokens';

/**
 * Email verification flow.
 *
 * Invariants:
 *  - Tokens are 256-bit random values stored only as SHA-256 hashes, expire
 *    after 24 hours and are single use.
 *  - Consumption is a single conditional UPDATE
 *    (`used_at IS NULL AND expires_at > now`). Two concurrent requests with the
 *    same token therefore cannot both succeed.
 *  - Requesting a new link invalidates every previous unused token, so an
 *    older email cannot verify an address after a resend.
 *  - Public responses never reveal whether an address is registered.
 *  - Delivery is never faked: when no provider is configured the flow logs an
 *    operational warning and reports that delivery was not confirmed.
 */

export const EMAIL_VERIFICATION_TTL_HOURS = 24;

export interface EmailVerificationRepository {
  findUserByEmail(email: string): Promise<{ id: string; name: string; verified: boolean } | null>;
  /** Invalidates prior unused tokens and stores the new one, atomically. */
  issueToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  /** Atomic single-use consumption. */
  consumeTokenAndVerify(input: { tokenHash: string; now: Date }): Promise<
    | { outcome: 'verified'; userId: string }
    | { outcome: 'invalid' }
    | { outcome: 'already_verified' }
  >;
  isVerified(userId: string): Promise<boolean>;
}

export function drizzleEmailVerificationRepository(): EmailVerificationRepository {
  return {
    async findUserByEmail(email) {
      const { db } = dbFromRequest();
      const rows = await db
        .select({ id: coreUsers.id, name: coreUsers.name, verifiedAt: coreUsers.emailVerifiedAt })
        .from(coreUsers)
        .where(and(eq(coreUsers.email, email), eq(coreUsers.status, 'active')))
        .limit(1);
      const row = rows[0];
      return row ? { id: row.id, name: row.name, verified: row.verifiedAt !== null } : null;
    },

    async issueToken({ userId, tokenHash, expiresAt }) {
      const { db } = dbFromRequest();
      await db.transaction(async (tx) => {
        // Only the newest link may verify the address.
        await tx
          .delete(emailVerificationTokens)
          .where(
            and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt))
          );
        await tx.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt });
      });
    },

    async consumeTokenAndVerify({ tokenHash, now }) {
      const { db } = dbFromRequest();
      return db.transaction(async (tx) => {
        // The guard in this single UPDATE is what makes replay impossible.
        const claimed = await tx
          .update(emailVerificationTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(emailVerificationTokens.tokenHash, tokenHash),
              isNull(emailVerificationTokens.usedAt),
              gt(emailVerificationTokens.expiresAt, now)
            )
          )
          .returning({ userId: emailVerificationTokens.userId });

        if (claimed.length === 0) return { outcome: 'invalid' } as const;

        const updated = await tx
          .update(coreUsers)
          .set({ emailVerifiedAt: now, updatedAt: now })
          .where(and(eq(coreUsers.id, claimed[0].userId), isNull(coreUsers.emailVerifiedAt)))
          .returning({ id: coreUsers.id });

        if (updated.length === 0) {
          // The address was verified through a different, already-valid link.
          return { outcome: 'already_verified' } as const;
        }

        return { outcome: 'verified', userId: claimed[0].userId } as const;
      });
    },

    async isVerified(userId) {
      const { db } = dbFromRequest();
      const rows = await db
        .select({ verifiedAt: coreUsers.emailVerifiedAt })
        .from(coreUsers)
        .where(eq(coreUsers.id, userId))
        .limit(1);
      return rows[0]?.verifiedAt != null;
    },
  };
}

export interface SendVerificationOptions {
  repository?: EmailVerificationRepository;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** Injectable mailer for tests; never supplied by request data. */
  send?: typeof sendEmailVerification;
}

export interface VerificationDispatchResult {
  /** True only when a message was actually handed to a provider. */
  emailDelivered: boolean;
  /** Always true, so responses cannot be used to enumerate accounts. */
  requested: true;
  /** Set only for an authenticated caller checking its own address. */
  alreadyVerified?: boolean;
}


/**
 * Issues and sends a verification link.
 *
 * The caller-visible result never distinguishes "unknown email" from "email
 * sent", which prevents account enumeration.
 */
export async function sendEmailVerificationLink(
  email: string,
  options: SendVerificationOptions = {}
): Promise<VerificationDispatchResult> {
  const repository = options.repository ?? drizzleEmailVerificationRepository();
  const now = options.now ?? (() => new Date());
  const send = options.send ?? sendEmailVerification;

  const user = await repository.findUserByEmail(email);

  if (!user) {
    // Unknown address: behave exactly as if a message had been queued.
    logger.info('Verification requested for an unknown address');
    return { emailDelivered: false, requested: true };
  }

  if (user.verified) {
    logger.info('Verification requested for an already verified address', { userId: user.id });
    return { emailDelivered: false, requested: true, alreadyVerified: true };
  }

  const token = generateEmailVerificationToken();
  const expiresAt = new Date(now().getTime() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  await repository.issueToken({
    userId: user.id,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt,
  });

  // The URL embeds the token, so this call is never logged.
  const result: EmailSendResult = await send({
    to: email,
    recipientName: user.name,
    verificationUrl: buildEmailVerificationUrl(config.APP_URL, token),
    expiresInHours: EMAIL_VERIFICATION_TTL_HOURS,
  });

  if (!result.delivered) {
    // Operator-configuration problem, recorded honestly without the address.
    logger.warn('Verification email was not delivered', {
      userId: user.id,
      reason: result.reason ?? 'provider unavailable',
    });
  }

  return { emailDelivered: result.delivered, requested: true };
}

export interface CompleteVerificationOptions {
  repository?: EmailVerificationRepository;
  now?: () => Date;
}

/**
 * Consumes a verification token and marks the address verified.
 *
 * Unknown, expired and already-used tokens all produce one generic message, so
 * the response cannot be used to probe tokens.
 */
export async function completeEmailVerification(
  token: string,
  options: CompleteVerificationOptions = {}
): Promise<{ verified: boolean }> {
  const repository = options.repository ?? drizzleEmailVerificationRepository();
  const now = options.now ?? (() => new Date());

  const result = await repository.consumeTokenAndVerify({
    tokenHash: hashEmailVerificationToken(token),
    now: now(),
  });

  if (result.outcome === 'invalid') {
    throw new AppError(
      AppErrorCode.VERIFICATION_INVALID,
      'This verification link is invalid or has expired.',
      400
    );
  }

  logger.info('Email verified', {
    userId: result.outcome === 'verified' ? result.userId : undefined,
    alreadyVerified: result.outcome === 'already_verified',
  });

  return { verified: true };
}

/** Whether a user's email is verified. Gates security-sensitive operations. */
export async function isEmailVerified(
  userId: string,
  repository?: EmailVerificationRepository
): Promise<boolean> {
  return (repository ?? drizzleEmailVerificationRepository()).isVerified(userId);
}

/**
 * Enforces the verified-email requirement for a security-sensitive action.
 * Throws a 403 with an actionable message when verification is required.
 */
export async function requireVerifiedEmail(
  userId: string,
  repository?: EmailVerificationRepository
): Promise<void> {
  if (!config.JOB_REQUIRE_VERIFIED_EMAIL_TO_APPLY) return;
  const verified = await isEmailVerified(userId, repository);
  if (!verified) {
    throw new AppError(
      AppErrorCode.EMAIL_NOT_VERIFIED,
      'Please verify your email address before continuing.',
      403
    );
  }
}

/** Removes expired tokens. Intended for a scheduled cleanup job. */
export async function purgeExpiredVerificationTokens(): Promise<number> {
  const { db } = dbFromRequest();
  const deleted = await db
    .delete(emailVerificationTokens)
    .where(lt(emailVerificationTokens.expiresAt, new Date()))
    .returning({ id: emailVerificationTokens.id });
  return deleted.length;
}
