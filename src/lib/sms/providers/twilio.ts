import { AppError } from "@/lib/errors";
import type { SendOtpInput, SendOtpResult, SmsProvider } from "../types";

/**
 * Twilio adapter STUB - intentionally not implemented.
 *
 * To enable:
 *   1. Set `SMS_PROVIDER=twilio`.
 *   2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`
 *      (a Twilio phone number or alphanumeric sender id).
 *   3. Replace the body of `sendOtp()` with:
 *        POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
 *        Authorization: Basic base64(TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN)
 *        Content-Type: application/x-www-form-urlencoded
 *        body: To, From, Body = "<your OTP message text>"
 *      or use the official `twilio` npm SDK (not installed by default).
 *   4. Return `{ providerMessageId: body.sid, raw: body }`.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";

  async sendOtp(_input: SendOtpInput): Promise<SendOtpResult> {
    throw new AppError(
      "Twilio SMS provider is not configured. Set SMS_PROVIDER and the TWILIO_* env vars, and implement src/lib/sms/providers/twilio.ts.",
      501,
      "sms_provider_not_implemented",
    );
  }
}