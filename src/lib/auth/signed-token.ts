import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Stateless HMAC-signed tokens used for short-lived browser handoffs:
 *   - the post-registration email ticket (unverified users cannot log in)
 *   - the Google OAuth `state` + PKCE `code_verifier` round trip
 *
 * They are NOT stored server-side, so they cannot be revoked early; each one
 * carries its own expiry and they only ever authorise an idempotent,
 * rate-limited operation.
 */

export function signToken(
  payload: Record<string, unknown>,
  ttlMs: number,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlMs }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", getEnv().SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function readToken<T extends { exp?: number }>(
  token: string | null | undefined,
): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", getEnv().SESSION_SECRET)
    .update(body)
    .digest();

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof parsed.exp === "number" && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}