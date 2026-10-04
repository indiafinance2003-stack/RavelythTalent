import type { SendOtpInput, SendOtpResult, SmsProvider } from "../types";

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
      throw new Error(
        "SMS_PROVIDER=console is not allowed in production. Configure msg91 or twilio.",
      );
    }

    console.warn(message);
    return { providerMessageId: `console-${Date.now()}` };
  }
}