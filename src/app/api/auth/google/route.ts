import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/security";
import {
  createOAuthState,
  googleAuthorizationUrl,
  googleConfigured,
} from "@/lib/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "ravelyth_google_state";

/** Starts the Google OAuth 2.0 + PKCE flow. */
export async function GET(request: Request): Promise<NextResponse> {
  const { APP_URL } = getEnv();

  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", APP_URL));
  }

  const ip = (await getRequestIp()) ?? "unknown";
  try {
    await enforceRateLimit(rateKey("login", `google:${ip}`), RATE_LIMITS.login);
  } catch {
    return NextResponse.redirect(new URL("/login?error=rate_limited", APP_URL));
  }

  const redirectTo = new URL(request.url).searchParams.get("next") ?? undefined;
  const { stateToken, state } = createOAuthState(redirectTo);

  const response = NextResponse.redirect(googleAuthorizationUrl(state));
  response.cookies.set(STATE_COOKIE, stateToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: APP_URL.startsWith("https://"),
    path: "/api/auth/google",
    maxAge: 600,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}