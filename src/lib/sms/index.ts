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

/** The MSG91 and Twilio adapters remain stubs; console OTP is never real SMS. */
export function smsProviderAvailable(): boolean {
  return false;
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