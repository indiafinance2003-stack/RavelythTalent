import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { ConsoleSmsProvider } from "./providers/console";
import { Msg91SmsProvider } from "./providers/msg91";
import { TwilioSmsProvider } from "./providers/twilio";
import type { SmsProvider } from "./types";

export * from "./types";

let cached: SmsProvider | null = null;

/** Resolves the configured provider once per process. */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const { SMS_PROVIDER } = getEnv();

  switch (SMS_PROVIDER) {
    case "msg91":
      cached = new Msg91SmsProvider();
      break;
    case "twilio":
      cached = new TwilioSmsProvider();
      break;
    case "console":
    default:
      cached = new ConsoleSmsProvider();
      break;
  }
  return cached;
}

/**
 * True only when a real provider (MSG91 or Twilio) is selected and every
 * credential it needs is present. The console provider is deliberately never
 * available: it only prints OTPs during development (and refuses outright in
 * production), so with the default `SMS_PROVIDER=console` - or a real
 * provider missing its env vars - the OTP request/verify endpoints stay
 * hidden behind HTTP 503 and no login UI option is offered.
 */
export function smsProviderAvailable(): boolean {
  const provider = getSmsProvider();
  if (provider.name === "console") return false;
  return provider.isConfigured();
}

/**
 * Sends an OTP. Returns false instead of throwing on transport failures so the
 * caller can show a generic message without leaking provider internals.
 */
export async function dispatchOtp(input: {
  to: string;
  otp: string;
  purpose: "login" | "phone_verification";
  expiresInMinutes: number;
}): Promise<boolean> {
  const provider = getSmsProvider();
  try {
    await provider.sendOtp(input);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.status >= 500) throw error;
    console.error(`[sms:${provider.name}] send failed:`, error);
    return false;
  }
}