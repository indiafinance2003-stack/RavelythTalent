import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { handleApi } from "@/lib/http";
import { consumeEmailVerificationToken } from "@/lib/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email verification link target. Consumes the single-use token, then redirects
 * to /login so the user can sign in. Query params:
 *   ?ok=1 | ?error=invalid|missing
 */
export const GET = handleApi(async (request: Request) => {
  const token = new URL(request.url).searchParams.get("token");

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/verify-email?error=${reason}`, getEnv().APP_URL),
      302,
    );

  if (!token) return fail("missing");

  const ok = await consumeEmailVerificationToken(token);
  if (!ok) return fail("invalid");

  const response = NextResponse.redirect(
    new URL("/login?verified=1", getEnv().APP_URL),
    302,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
});