import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { otpCodes, users } from "@/lib/db/schema";
import { generateOtp, sha256Hex } from "@/lib/auth/crypto";
import { dispatchOtp, normalizePhone, smsProviderAvailable } from "@/lib/sms";
import { AppError } from "@/lib/errors";
import type { OtpPurpose } from "@/lib/sms";

/**
 * Mobile OTP: 6 digits, SHA-256 hashed at rest, 5 minute expiry, max 5
 * attempts, 60 second resend cooldown.
 *
 * Real SMS delivery is intentionally left to the owner - see
 * src/lib/sms/providers/*.ts and ASSUMPTIONS.md.
 */

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Sends a fresh OTP and returns the digits (never logged in production). */
export async function sendOtp(
  phoneRaw: string,
  purpose: OtpPurpose,
): Promise<void> {
  if (!smsProviderAvailable()) {
    throw new AppError(
      "Mobile OTP is not available yet. Please use email or contact support.",
      503,
      "sms_provider_unavailable",
    );
  }
  const phone = normalizePhone(phoneRaw);

  const recent = await db
    .select({ lastSentAt: otpCodes.lastSentAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  const lastSent = recent.at(0)?.lastSentAt;
  if (lastSent && Date.now() - lastSent.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - lastSent.getTime())) / 1000,
    );
    throw new AppError(
      `Please wait ${wait} second${wait === 1 ? "" : "s"} before requesting another code.`,
      429,
      "otp_cooldown",
    );
  }

  // Any still-valid code for this phone/purpose is invalidated.
  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)),
    );

  const code = generateOtp(6);

  await db.insert(otpCodes).values({
    phone,
    codeHash: sha256Hex(code),
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    lastSentAt: new Date(),
    maxAttempts: MAX_ATTEMPTS,
  });

  const delivered = await dispatchOtp({
    to: phone,
    otp: code,
    purpose,
    expiresInMinutes: OTP_TTL_MS / 60000,
  });

  if (!delivered) {
    throw new AppError(
      "We could not send the OTP right now. Please try again.",
      502,
      "otp_send_failed",
    );
  }
}

export type OtpVerifyResult =
  | { ok: true; userId: string | null; verifiedPhone: string }
  | { ok: false; message: string; attemptsLeft?: number };

/**
 * Verifies the code. For `phone_verification` it marks the phone verified on
 * the supplied user; for `login` it resolves (or requires) an account.
 */
export async function verifyOtp(
  phoneRaw: string,
  code: string,
  purpose: OtpPurpose,
  userId?: string | null,
): Promise<OtpVerifyResult> {
  const phone = normalizePhone(phoneRaw);

  const rows = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phone, phone),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
        sql`${otpCodes.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  const row = rows.at(0);
  if (!row) {
    return {
      ok: false,
      message: "That code is invalid or has expired. Request a new one.",
    };
  }

  if (row.attempts >= row.maxAttempts) {
    return {
      ok: false,
      message: "Too many incorrect attempts. Request a new code.",
    };
  }

  if (row.codeHash !== sha256Hex(code)) {
    const attempts = row.attempts + 1;
    await db
      .update(otpCodes)
      .set({ attempts })
      .where(eq(otpCodes.id, row.id));
    return {
      ok: false,
      message: "That code is incorrect.",
      attemptsLeft: Math.max(0, row.maxAttempts - attempts),
    };
  }

  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(eq(otpCodes.id, row.id));

  if (purpose === "phone_verification") {
    if (!userId) {
      throw new AppError("Sign in before verifying a phone number.", 401, "unauthenticated");
    }
    await db
      .update(users)
      .set({ phone, phoneVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { ok: true, userId, verifiedPhone: phone };
  }

  const account = await db
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  const user = account.at(0);
  if (!user) {
    return {
      ok: false,
      message:
        "No account is linked to this mobile number yet. Sign in with email first, then verify your phone.",
    };
  }
  if (!user.emailVerifiedAt) {
    return {
      ok: false,
      message: "Please verify your email address before signing in with an OTP.",
    };
  }

  return { ok: true, userId: user.id, verifiedPhone: phone };
}