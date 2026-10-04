import { headers } from "next/headers";
import { constantTimeEqual } from "@/lib/auth/crypto";
import { AuthorizationError, CsrfError } from "@/lib/errors";
import { getEnv } from "@/lib/env";

/**
 * Request-level security guards.
 *
 * These run inside the Node.js request handler (not edge middleware), so every
 * mutation genuinely goes through them.
 */

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Verifies that a mutating request originates from this site.
 *
 * The browser sends `Origin` on every POST/PUT/PATCH/DELETE (including fetch and
 * form posts), so comparing it to the `Host` header is a reliable CSRF defence
 * when combined with `SameSite=Lax` cookies.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  const { APP_URL } = getEnv();

  if (!origin) {
    throw new CsrfError("Missing Origin header on a mutating request.");
  }

  const originHost = hostOf(origin);
  if (!originHost) throw new CsrfError("Malformed Origin header.");

  const allowed = new Set<string>();
  if (host) allowed.add(host.toLowerCase());
  const appHost = hostOf(APP_URL);
  if (appHost) allowed.add(appHost);

  if (!allowed.has(originHost)) {
    throw new CsrfError(`Origin ${origin} is not allowed.`);
  }
}

/**
 * Guards internal cron endpoints with a constant-time secret comparison.
 * Network access is restricted by the loopback-only app listener and public
 * Nginx denial; forwarded headers are untrusted and are not peer identity.
 */
export async function assertCronRequest(): Promise<void> {
  const h = await headers();
  const { CRON_SECRET } = getEnv();

  const provided = h.get("x-cron-secret") ?? "";
  if (!provided || !constantTimeEqual(provided, CRON_SECRET)) {
    throw new AuthorizationError("Invalid cron secret.", "invalid_cron_secret", 401);
  }

}

export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  // Nginx overwrites X-Real-IP with the peer address. X-Forwarded-For and
  // provider-specific headers can contain client-supplied values and must not
  // be used to evade IP-based rate limits.
  return h.get("x-real-ip")?.trim() || null;
}