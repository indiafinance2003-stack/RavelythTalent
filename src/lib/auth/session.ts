import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { generateToken, sha256Hex } from "./crypto";
import { getEnv } from "@/lib/env";
import { getRequestIp } from "@/lib/security";

export const SESSION_COOKIE = "ravelyth_session";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * The session projection intentionally excludes `passwordHash`,
 * `failedLoginAttempts`, `lockedUntil` and soft-delete columns so they can
 * never leak into a page or API response.
 */
export type SessionUser = {
  sessionId: string;
  id: string;
  email: string;
  fullName: string;
  role: "candidate" | "recruiter" | "admin" | "job_seeker";
  status: "active" | "suspended" | "deactivated";
  emailVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  avatarPath: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  chatMuteUntil: Date | null;
};

/** Uses X-Real-IP, which the deployment proxy overwrites with its peer IP. */
export async function getClientIp(): Promise<string | null> {
  return getRequestIp();
}

function cookieSecure(): boolean {
  const { APP_URL } = getEnv();
  return APP_URL.startsWith("https://");
}

async function requestMeta(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const ip = await getRequestIp();
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Creates a session row and sets the cookie.
 * The raw token is returned ONLY to the caller; the database stores its hash.
 */
export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken(32);
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const { ip, userAgent } = await requestMeta();

  await db.insert(sessions).values({
    userId,
    tokenHash,
    ip,
    userAgent,
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return { token, expiresAt };
}

/** Clears the cookie. Safe to call when no session exists. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.tokenHash, sha256Hex(token)),
          isNull(sessions.revokedAt),
        ),
      );
  }
  store.delete(SESSION_COOKIE);
}

/** "Log out of all devices" - revokes every active session for the user. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Resolves the current user from the session cookie.
 * Returns null for anonymous, expired, revoked, suspended or deleted users.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      phone: users.phone,
      phoneVerifiedAt: users.phoneVerifiedAt,
      avatarPath: users.avatarPath,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      chatMuteUntil: users.chatMuteUntil,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256Hex(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  const user = rows.at(0);
  if (!user) return null;
  if (user.status !== "active") return null;

  // Rolling last-used timestamp, best effort (never blocks the request).
  void db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, user.sessionId))
    .catch(() => undefined);

  return user;
}

/** Housekeeping helper used by the cleanup cron. */
export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}