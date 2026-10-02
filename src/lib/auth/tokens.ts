import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Session tokens are 256-bit cryptographically secure random values rendered
 * as URL-safe strings. Only a SHA-256 hash of the token is persisted, so a
 * database leak does not expose usable credentials.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Email verification tokens.
 *
 * Same security contract as session and password-reset tokens:
 *  - 256 bits of cryptographically secure randomness, base64url encoded;
 *  - only the SHA-256 hash is ever persisted, so a database leak does not
 *    yield a usable verification link;
 *  - tokens expire server-side (24h) and are single use, enforced by an
 *    atomic conditional UPDATE rather than a read-then-write.
 *
 * The raw token exists only in server memory and the emailed URL, and must
 * never be logged or returned to a client other than inside that URL.
 */
export function generateEmailVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashEmailVerificationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Builds the verification URL from APP_URL (never from request input). */
export function buildEmailVerificationUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/+$/, '');
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Password reset tokens use the same primitive as session tokens: at least 32
 * cryptographically secure random bytes rendered as a URL-safe base64url
 * string. Only the SHA-256 hash is ever persisted; the raw token exists only in
 * server memory, the reset URL, and the emitted reset email — and must never be
 * logged, stored in analytics, or included in error messages.
 */
export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // Compare against self to keep timing constant, then fail.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
