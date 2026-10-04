import { AppError } from "@/lib/errors";
import type { SendOtpInput, SendOtpResult, SmsProvider } from "../types";

/**
 * MSG91 adapter STUB - intentionally not implemented.
 *
 * To enable:
 *   1. Set `SMS_PROVIDER=msg91`.
 *   2. Set `MSG91_AUTH_KEY`, `MSG91_SENDER_ID` and `MSG91_TEMPLATE_ID`
 *      (the approved DLT template id from MSG91).
 *   3. Replace the body of `sendOtp()` with a request to:
 *        POST https://control.msg91.com/api/v5/flow/
 *        headers: { authkey: MSG91_AUTH_KEY, content-type: application/json }
 *        body: {
 *          template_id: MSG91_TEMPLATE_ID,
 *          sender: MSG91_SENDER_ID,
 *          short_url: "0",
 *          recipients: [{ mobiles: "<number without +91>", OTP: "<otp>",
 *                          otp: "<otp>" }]
 *        }
 *   4. Handle MSG91's `type: success` responses and surface failures by
 *      returning `{ raw: body }` rather than throwing on transport errors.
 */
export class Msg91SmsProvider implements SmsProvider {
  readonly name = "msg91";

  async sendOtp(_input: SendOtpInput): Promise<SendOtpResult> {
    throw new AppError(
      "MSG91 SMS provider is not configured. Set SMS_PROVIDER and the MSG91_* env vars, and implement src/lib/sms/providers/msg91.ts.",
      501,
      "sms_provider_not_implemented",
    );
  }
}