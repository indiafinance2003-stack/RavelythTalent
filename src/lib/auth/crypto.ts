import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Opaque, URL-safe random token (default 32 bytes = 256 bits). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Deterministic hash used to store tokens/session ids at rest. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** HMAC-free constant-time string comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still perform a comparison to keep timing flat.
    const filler = Buffer.alloc(bufA.length);
    timingSafeEqual(bufA, filler);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Numeric one-time password, uniformly distributed. */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  let value = 0;
  const bytes = randomBytes(4);
  value = bytes.readUInt32BE(0) % max;
  return value.toString().padStart(digits, "0");
}

/** RFC 7636 PKCE code verifier. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** RFC 7636 S256 code challenge. */
export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Non-reversible fingerprint (used for view/rate-limit de-duplication). */
export function fingerprint(...parts: Array<string | null | undefined>): string {
  return sha256Hex(parts.filter(Boolean).join("|")).slice(0, 32);
}
