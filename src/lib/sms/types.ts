/**
 * SMS provider abstraction.
 *
 * ## Implementing a real provider
 *
 * 1. Add `SmsProvider` implementation in `src/lib/sms/providers/` (see
 *    `msg91.ts` / `twilio.ts` for fully-commented templates).
 * 2. Set `SMS_PROVIDER=msg91` or `twilio` and fill the matching env vars.
 * 3. Nothing else changes - `getSmsProvider()` resolves it at call time.
 *
 * NOTE FOR THE OWNER: no real SMS integration is shipped. Until a provider is
 * selected and configured, keep `SMS_PROVIDER=console`, which logs the OTP to
 * the server console only (and is refused outright when NODE_ENV=production).
 */

export type OtpPurpose = "login" | "phone_verification";

export type SendOtpInput = {
  /** E.164 or local Indian number, e.g. +919876543210 */
  to: string;
  otp: string;
  purpose: OtpPurpose;
  expiresInMinutes: number;
};

export type SendOtpResult = {
  providerMessageId?: string;
  /** Raw provider response, stored for troubleshooting only. */
  raw?: unknown;
};

export interface SmsProvider {
  readonly name: string;
  /**
   * Sends a one-time password. Implementations must not throw on transient
   * transport failures - the caller already rate limits and surfaces a
   * generic "could not send OTP" message.
   */
  sendOtp(input: SendOtpInput): Promise<SendOtpResult>;
}

/** Normalises Indian phone numbers to +91XXXXXXXXXX. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.startsWith("+")) return `+${digits}`;
  return digits;
}