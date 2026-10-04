import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { RateLimitError } from "@/lib/errors";

/**
 * DB-backed fixed-window rate limiting.
 *
 * Chosen over an in-memory limiter because it survives process restarts and is
 * consistent if the app is ever run with more than one Node process.
 */

export type RateRule = {
  /** Maximum requests allowed inside one window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * Documented limits.
 *   register            5 / hour   per IP
 *   login              10 / 15 min  per IP + per account
 *   verify-resend       5 / hour   per IP + per account
 *   forgot-password     5 / hour   per IP
 *   reset-password     10 / hour   per IP
 *   otp-request         3 / 15 min  per phone + per IP
 *   otp-verify         10 / 15 min  per phone + per IP
 *   contact-form        5 / hour   per IP
 */
export const RATE_LIMITS = {
  register: { limit: 5, windowSeconds: 60 * 60 },
  login: { limit: 10, windowSeconds: 15 * 60 },
  verifyResend: { limit: 5, windowSeconds: 60 * 60 },
  forgotPassword: { limit: 5, windowSeconds: 60 * 60 },
  resetPassword: { limit: 10, windowSeconds: 60 * 60 },
  otpRequest: { limit: 3, windowSeconds: 15 * 60 },
  otpVerify: { limit: 10, windowSeconds: 15 * 60 },
  contactForm: { limit: 5, windowSeconds: 60 * 60 },
  checkout: { limit: 20, windowSeconds: 15 * 60 },
} satisfies Record<string, RateRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function rateKey(
  name: RateLimitName | string,
  ...parts: Array<string | number | null | undefined>
): string {
  const clean = parts
    .map((p) => (p === null || p === undefined ? "" : String(p)))
    .filter((p) => p.length > 0)
    .join(":");
  return clean ? `${name}:${clean}` : name;
}

export type RateResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

/** Atomically increments the counter for `key` and reports the verdict. */
export async function consumeRateLimit(
  key: string,
  rule: RateRule,
): Promise<RateResult> {
  const now = new Date();
  const windowMs = rule.windowSeconds * 1000;
  const staleBefore = new Date(now.getTime() - windowMs);

  const rows = await db
    .insert(rateLimits)
    .values({ bucketKey: key, count: 1, windowStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.bucketKey,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStartedAt} < ${staleBefore} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${rateLimits.windowStartedAt} < ${staleBefore} THEN ${now} ELSE ${rateLimits.windowStartedAt} END`,
        updatedAt: now,
      },
    })
    .returning({
      count: rateLimits.count,
      windowStartedAt: rateLimits.windowStartedAt,
    });

  const row = rows.at(0);
  const count = row?.count ?? 1;
  const startedAt = row?.windowStartedAt ?? now;

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt: new Date(startedAt.getTime() + windowMs),
  };
}

/** Throws a 429 RateLimitError when the bucket is exhausted. */
export async function enforceRateLimit(key: string, rule: RateRule): Promise<void> {
  const result = await consumeRateLimit(key, rule);
  if (!result.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    );
    throw new RateLimitError(
      "Too many attempts. Please wait a few minutes and try again.",
      retryAfter,
    );
  }
}

/** Used by the cleanup cron to keep the table small. */
export async function purgeRateLimits(): Promise<number> {
  const deleted = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStartedAt, new Date(Date.now() - 24 * 3600 * 1000)))
    .returning({ id: rateLimits.id });
  return deleted.length;
}