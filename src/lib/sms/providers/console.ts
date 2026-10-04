import type { SendOtpInput, SendOtpResult, SmsProvider } from "../types";
import { AppError } from "@/lib/errors";

/**
 * Development provider: writes the OTP to the server console instead of
 * sending an SMS. It refuses to "send" anything in production so an
 * unconfigured deployment can never leak real one-time passwords to logs.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    const message = `[sms:console] to=${input.to} purpose=${input.purpose} otp=${input.otp} expires=${input.expiresInMinutes}m`;

    if (process.env.NODE_ENV === "production") {
      throw new AppError(
        "Mobile verification is unavailable. Configure a real SMS provider.",
        503,
        "sms_provider_unavailable",
      );
    }

    console.warn(message);
    return { providerMessageId: `console-${Date.now()}` };
  }
}