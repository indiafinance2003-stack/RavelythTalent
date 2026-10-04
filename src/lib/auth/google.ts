import { generateCodeVerifier, generateToken, codeChallengeS256 } from "./crypto";
import { getEnv } from "@/lib/env";
import { appUrl } from "@/lib/email/urls";
import { readToken, signToken } from "./signed-token";

/**
 * Google OAuth 2.0 with PKCE (S256) + state.
 *
 * Implemented directly against Google's endpoints (`arctic` is deprecated),
 * using only `node:crypto` and `fetch`.
 *
 * Owner setup:
 *   Google Cloud Console -> APIs & Services -> Credentials -> OAuth client ID
 *   Authorised redirect URI: {APP_URL}/api/auth/google/callback
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPE = "openid email profile";

export type GoogleProfile = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string | null;
};

export function googleConfigured(): boolean {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getEnv();
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return appUrl("/api/auth/google/callback");
}

export type OAuthState = {
  state: string;
  verifier: string;
  redirectTo?: string;
};

export function createOAuthState(redirectTo?: string): {
  stateToken: string;
  state: OAuthState;
} {
  const state: OAuthState = {
    state: generateToken(24),
    verifier: generateCodeVerifier(),
    redirectTo,
  };
  // Signed + 10 minute expiry, stored in an httpOnly cookie.
  return { stateToken: signState(state), state };
}

function signState(state: OAuthState): string {
  return signToken(
    { s: state.state, v: state.verifier, r: state.redirectTo ?? null },
    10 * 60 * 1000,
  );
}

type StatePayload = { s?: string; v?: string; r?: string | null; exp?: number };

/** Restores the signed state, or null if the cookie is missing/expired/forged. */
export function readOAuthState(stateToken: string | null | undefined): OAuthState | null {
  const payload = readToken<StatePayload>(stateToken);
  if (!payload?.s || !payload.v) return null;
  return {
    state: payload.s,
    verifier: payload.v,
    redirectTo: payload.r ?? undefined,
  };
}

export function googleAuthorizationUrl(state: OAuthState): string {
  const { GOOGLE_CLIENT_ID } = getEnv();
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    state: state.state,
    code_challenge: codeChallengeS256(state.verifier),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForProfile(
  code: string,
  verifier: string,
): Promise<GoogleProfile> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getEnv();

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID ?? "",
      client_secret: GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Google token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}`,
    );
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("Google did not return an access token.");

  const infoResponse = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoResponse.ok) {
    throw new Error(
      `Google userinfo failed: ${infoResponse.status} ${await infoResponse.text()}`,
    );
  }

  const info = (await infoResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!info.sub || !info.email) {
    throw new Error("Google account is missing an id or email address.");
  }

  return {
    id: info.sub,
    email: info.email.toLowerCase(),
    emailVerified: info.email_verified === true,
    name: info.name ?? info.email.split("@")[0]!,
    picture: info.picture ?? null,
  };
}