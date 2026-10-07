/**
 * SMS provider abstraction.
 *
 * ## Available providers
 *
 * - `msg91` / `twilio`: full HTTP adapters in `src/lib/sms/providers/`
 *   against each provider's documented API. Selected with `SMS_PROVIDER` and
 *   the matching `MSG91_*` / `TWILIO_*` env vars; they stay unused until
 *   those variables exist.
 * - `console` (default): development-only stand-in that prints the OTP to
 *   the server console and is refused outright when NODE_ENV=production.
 *
 * `smsProviderAvailable()` (see `index.ts`) is what keeps the OTP endpoints
 * hidden until a real provider is configured.
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
  /** True when every credential this provider needs is present. */
  isConfigured(): boolean;
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