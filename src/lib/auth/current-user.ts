import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";
import { AuthorizationError, UnauthenticatedError } from "@/lib/errors";

export type CurrentUser = SessionUser;

/** Per-request memoised current user (null when anonymous). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> =>
  getSessionUser(),
);

/* -------------------------------------------------------------------------- */
/* Page guards - use in server components and server actions                   */
/* -------------------------------------------------------------------------- */

/** Requires any signed-in, active user; otherwise redirects to /login. */
export async function requireUser(redirectTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(redirectTo ? `/login?next=${encodeURIComponent(redirectTo)}` : "/login");
  }
  return user;
}

/** Requires a signed-in user whose role is in `roles`. */
export async function requireRole(
  ...roles: Array<CurrentUser["role"]>
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** Requires a verified email (unverified accounts cannot use the product). */
export async function requireVerifiedUser(
  redirectTo?: string,
): Promise<CurrentUser> {
  const user = await requireUser(redirectTo);
  if (!user.emailVerifiedAt) redirect("/verify-email");
  return user;
}

/* -------------------------------------------------------------------------- */
/* API guards - throw AuthorizationError which route handlers translate to JSON */
/* -------------------------------------------------------------------------- */

export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}

export async function requireApiRole(
  ...roles: Array<CurrentUser["role"]>
): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (!roles.includes(user.role)) {
    throw new AuthorizationError();
  }
  return user;
}

export async function requireApiAdmin(): Promise<CurrentUser> {
  return requireApiRole("admin");
}

export async function requireApiVerifiedUser(): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (!user.emailVerifiedAt) {
    throw new AuthorizationError(
      "Please verify your email address to continue.",
      "email_unverified",
      403,
    );
  }
  return user;
}

export function isAdmin(user: CurrentUser | null): boolean {
  return user?.role === "admin";
}

export function isRecruiter(user: CurrentUser | null): boolean {
  return user?.role === "recruiter" || user?.role === "admin";
}