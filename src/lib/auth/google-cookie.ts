import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

/**
 * The OAuth round-trip cookie. Path-scoped to /api/auth/google so it is sent
 * back on the callback and nowhere else, and it never leaves the server.
 */
export const GOOGLE_STATE_COOKIE = "ravelyth_google_state";

export async function setGoogleStateCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/api/auth/google",
    maxAge: 600,
  });
}

export async function clearGoogleStateCookie(): Promise<void> {
  const store = await cookies();
  store.delete(GOOGLE_STATE_COOKIE);
}