import { cookies } from "next/headers";
import { constantTimeEqual } from "@/lib/auth/crypto";
import { signInWithGoogle } from "@/lib/auth/service";
import { createSession } from "@/lib/auth/session";
import { exchangeCodeForProfile, readOAuthState } from "@/lib/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "ravelyth_google_state";

/** Google OAuth 2.0 callback: verifies state + PKCE, then links and signs in. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const store = await cookies();
  const stateToken = store.get(STATE_COOKIE)?.value ?? null;
  store.delete(STATE_COOKIE);

  const state = readOAuthState(stateToken);

  const failure = (reason: string): Response => {
    const target = new URL(`/login?error=${encodeURIComponent(reason)}`, url.origin);
    const response = Response.redirect(target, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  if (oauthError) return failure(oauthError);
  if (!code) return failure("missing_code");
  if (!state) return failure("invalid_state");
  if (!returnedState || !constantTimeEqual(state.state, returnedState)) {
    return failure("invalid_state");
  }

  let profile;
  try {
    profile = await exchangeCodeForProfile(code, state.verifier);
  } catch (error) {
    console.error("[auth] google exchange failed:", error);
    return failure("google_exchange_failed");
  }

  const { userId, created } = await signInWithGoogle({
    id: profile.id,
    email: profile.email,
    emailVerified: profile.emailVerified,
    name: profile.name,
  });

  await createSession(userId);

  const safeRedirect =
    state.redirectTo &&
    state.redirectTo.startsWith("/") &&
    !state.redirectTo.startsWith("//")
      ? state.redirectTo
      : "/dashboard";

  const response = Response.redirect(
    new URL(created ? `${safeRedirect}?welcome=1` : safeRedirect, url.origin),
    302,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
