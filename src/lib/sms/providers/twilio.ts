import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { SendOtpInput, SendOtpResult, SmsProvider } from "../types";
import { smsFetch, stringField } from "./http";

/**
 * Twilio adapter - OTP delivery through the documented Messages resource.
 *
 * Selected with `SMS_PROVIDER=twilio` plus `TWILIO_ACCOUNT_SID`,
 * `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` (a Twilio number or the
 * registered alphanumeric sender). Uses HTTP Basic auth with the account
 * SID/token and an `application/x-www-form-urlencoded` body - the official
 * `twilio` SDK is deliberately not added as a dependency.
 *
 * The adapter stays unused until those variables exist: without them
 * `smsProviderAvailable()` keeps the OTP endpoints hidden (HTTP 503) and
 * `sendOtp()` refuses before any network call. Never verified against the
 * live Twilio API - see KNOWN_ISSUES.md.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";

  isConfigured(): boolean {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = getEnv();
    return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
  }

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = getEnv();
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      throw new AppError(
        "Twilio SMS provider is not configured. Set SMS_PROVIDER=twilio and TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.",
        503,
        "sms_provider_unavailable",
      );
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      TWILIO_ACCOUNT_SID,
    )}/Messages.json`;

    const response = await smsFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: input.to,
        From: TWILIO_FROM_NUMBER,
        Body: otpMessage(input),
      }).toString(),
    });

    if (!response.ok) {
      const message = stringField(response.body, "message");
      throw new Error(
        `Twilio returned HTTP ${response.status}${message ? `: ${message}` : "."}`,
      );
    }

    return {
      providerMessageId: stringField(response.body, "sid"),
      raw: response.body,
    };
  }
}

function otpMessage(input: SendOtpInput): string {
  const what = input.purpose === "login" ? "sign-in" : "phone verification";
  return `Ravelyth Talent: your ${what} code is ${input.otp}. It expires in ${input.expiresInMinutes} minutes. Do not share this code.`;
}
