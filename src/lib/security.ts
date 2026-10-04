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
 * Guards the internal cron endpoints: requires a constant-time match of the
 * `x-cron-secret` header AND a loopback caller. External callers therefore
 * cannot trigger background work even if the secret leaked.
 */
export async function assertCronRequest(): Promise<void> {
  const h = await headers();
  const { CRON_SECRET } = getEnv();

  const provided = h.get("x-cron-secret") ?? "";
  if (!provided || !constantTimeEqual(provided, CRON_SECRET)) {
    throw new AuthorizationError("Invalid cron secret.", "invalid_cron_secret", 401);
  }

  const remoteIp =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  // Behind nginx on the same host, 127.0.0.1 is what the proxy reports.
  const loopback = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);
  if (remoteIp && !loopback.has(remoteIp)) {
    throw new AuthorizationError("Cron calls are localhost-only.", "cron_remote", 403);
  }
}

export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? null;
}