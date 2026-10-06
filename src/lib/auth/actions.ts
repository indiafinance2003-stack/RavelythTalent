"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertSameOrigin, getRequestIp } from "@/lib/security";
import { AppError, CsrfError } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import {
  formError,
  formSuccess,
  fieldErrorsFromIssues,
  type FormState,
} from "@/lib/form-state";
import {
  formDataToObject,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { createEmailTicket, readEmailTicket } from "./email-ticket";
import {
  authenticate,
  consumeEmailVerificationToken,
  issueEmailVerification,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "./service";
import {
  createSession,
  destroySession,
  getSessionUser,
  revokeAllSessions,
} from "./session";

/** Only same-origin relative paths are accepted as post-login redirects. */
function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function homeForRole(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "recruiter") return "/recruiter";
  return "/dashboard";
}

async function limitByIp(name: keyof typeof RATE_LIMITS): Promise<void> {
  const ip = (await getRequestIp()) ?? "unknown";
  await enforceRateLimit(rateKey(name, ip), RATE_LIMITS[name]);
}

/* -------------------------------------------------------------------------- */
/* Register                                                                    */
/* -------------------------------------------------------------------------- */

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    await limitByIp("register");

    const parsed = registerSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
        message: "Please fix the highlighted fields.",
      };
    }

    const data = parsed.data;
    if (data.role === "recruiter") await limitByIp("companyRegister");
    await registerUser(data);

    // Unverified users cannot log in, so send them straight to the
    // verification page with a signed ticket for resending.
    redirect(
      `/verify-email?ticket=${encodeURIComponent(createEmailTicket(data.email))}`,
    );
  } catch (error) {
    if (error instanceof CsrfError) return formError(error.message);
    if (error instanceof ZodError) {
      return {
        status: "error",
        fieldErrors: fieldErrorsFromIssues(error.issues),
        message: "Please fix the highlighted fields.",
      };
    }
    if (error instanceof AppError) return formError(error.message);
    if (isRedirectError(error)) throw error;
    console.error("[auth] register failed:", error);
    return formError("We could not create your account. Please try again.");
  }
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let emailForLimit = "unknown";
  try {
    await assertSameOrigin();
    const raw = formDataToObject(formData);
    emailForLimit = raw.email ?? "unknown";

    await limitByIp("login");
    await enforceRateLimit(
      rateKey("login", emailForLimit.toLowerCase()),
      RATE_LIMITS.login,
    );

    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
        message: "Please enter your email address and password.",
        values: { email: raw.email ?? "" },
      };
    }

    const result = await authenticate(parsed.data);

    if (!result.ok) {
      if (result.code === "email_unverified") {
        return formError(result.message, { email: parsed.data.email });
      }
      return formError(result.message, { email: parsed.data.email });
    }

    await createSession(result.userId);

    const next = safeNext(raw.next);
    const session = await getSessionUser();
    redirect(next ?? homeForRole(session?.role ?? "job_seeker"));
  } catch (error) {
    if (error instanceof CsrfError) return formError(error.message);
    if (error instanceof AppError) return formError(error.message);
    // `redirect()` throws a NEXT_REDIRECT control-flow error - let it through.
    if (isRedirectError(error)) throw error;
    console.error("[auth] login failed:", error);
    return formError("We could not sign you in. Please try again.");
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/* -------------------------------------------------------------------------- */
/* Logout                                                                      */
/* -------------------------------------------------------------------------- */

export async function logoutAction(): Promise<void> {
  await assertSameOrigin();
  await destroySession();
  redirect("/");
}

export async function logoutAllDevicesAction(): Promise<void> {
  await assertSameOrigin();
  const user = await getSessionUser();
  if (user) await revokeAllSessions(user.id);
  redirect("/login");
}

/* -------------------------------------------------------------------------- */
/* Email verification                                                          */
/* -------------------------------------------------------------------------- */

export async function resendVerificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();

    // Signed-in users resend to their own address; everyone else needs the
    // ticket handed out at registration (unverified accounts cannot log in).
    const sessionUser = await getSessionUser();
    const email = sessionUser?.email ?? readEmailTicket(String(formData.get("ticket") ?? ""));

    if (!email) {
      return formError(
        "This verification request expired. Please register again or contact support.",
      );
    }

    await enforceRateLimit(rateKey("verifyResend", email), RATE_LIMITS.verifyResend);
    await limitByIp("verifyResend");

    const account = sessionUser
      ? sessionUser
      : await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            emailVerifiedAt: users.emailVerifiedAt,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
          .then((rows) => rows.at(0) ?? null);

    if (!account) {
      return formError("We could not find that account. Please register again.");
    }

    if (account.emailVerifiedAt) {
      return formSuccess("Your email is already verified. Please sign in.");
    }

    await issueEmailVerification(account, { isResend: true });
    return formSuccess("Verification email sent. Please check your inbox.");
  } catch (error) {
    if (error instanceof CsrfError) return formError(error.message);
    if (error instanceof AppError) return formError(error.message);
    console.error("[auth] resend verification failed:", error);
    return formError("We could not send the email right now. Please try again.");
  }
}

export async function verifyEmailTokenAction(
  token: string,
): Promise<{ ok: boolean; message: string }> {
  if (!token) {
    return { ok: false, message: "This verification link is not valid." };
  }
  const ok = await consumeEmailVerificationToken(token);
  return ok
    ? { ok: true, message: "Your email address is verified. You can sign in now." }
    : {
        ok: false,
        message:
          "This verification link is invalid or has expired. Request a new one below.",
      };
}

/* -------------------------------------------------------------------------- */
/* Password reset                                                              */
/* -------------------------------------------------------------------------- */

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formDataToObject(formData);
  try {
    await assertSameOrigin();
    await limitByIp("forgotPassword");

    const parsed = forgotPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
        message: "Enter a valid email address.",
        values: { email: raw.email ?? "" },
      };
    }

    await enforceRateLimit(
      rateKey("forgotPassword", parsed.data.email),
      RATE_LIMITS.forgotPassword,
    );

    await requestPasswordReset(parsed.data.email);

    // Deliberately identical response whether or not the account exists.
    return formSuccess(
      "If an account exists for that email address, a reset link is on its way.",
    );
  } catch (error) {
    if (error instanceof CsrfError) return formError(error.message);
    if (error instanceof AppError) return formError(error.message);
    console.error("[auth] forgot password failed:", error);
    return formError("We could not process that request. Please try again.");
  }
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formDataToObject(formData);
  try {
    await assertSameOrigin();
    await limitByIp("resetPassword");

    const parsed = resetPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
        message: "Please fix the highlighted fields.",
      };
    }

    await resetPassword(parsed.data.token, parsed.data.password);
    return formSuccess("Your password has been updated. You can sign in now.");
  } catch (error) {
    if (error instanceof CsrfError) return formError(error.message);
    if (error instanceof AppError) return formError(error.message);
    console.error("[auth] reset password failed:", error);
    return formError("We could not update your password. Please try again.");
  }
}