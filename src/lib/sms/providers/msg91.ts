import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { SendOtpInput, SendOtpResult, SmsProvider } from "../types";
import { smsFetch, stringField } from "./http";

/**
 * MSG91 adapter - OTP delivery through the documented v5 Flow API.
 *
 * Selected with `SMS_PROVIDER=msg91` plus `MSG91_AUTH_KEY`,
 * `MSG91_SENDER_ID` and `MSG91_TEMPLATE_ID` (the DLT-approved template).
 * The template must declare `{{otp}}`/`{{OTP}}` variables; both are sent so
 * either naming works. The recipient number is passed without the "+91"
 * prefix, as the Flow API expects for Indian sender IDs.
 *
 * The adapter stays unused until those variables exist: without them
 * `smsProviderAvailable()` keeps the OTP endpoints hidden (HTTP 503) and
 * `sendOtp()` refuses before any network call. Never verified against the
 * live MSG91 API - see KNOWN_ISSUES.md.
 */
export class Msg91SmsProvider implements SmsProvider {
  readonly name = "msg91";

  isConfigured(): boolean {
    const { MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID } = getEnv();
    return Boolean(MSG91_AUTH_KEY && MSG91_SENDER_ID && MSG91_TEMPLATE_ID);
  }

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    const { MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID } = getEnv();
    if (!MSG91_AUTH_KEY || !MSG91_SENDER_ID || !MSG91_TEMPLATE_ID) {
      throw new AppError(
        "MSG91 SMS provider is not configured. Set SMS_PROVIDER=msg91 and MSG91_AUTH_KEY, MSG91_SENDER_ID and MSG91_TEMPLATE_ID.",
        503,
        "sms_provider_unavailable",
      );
    }

    const response = await smsFetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: MSG91_AUTH_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: MSG91_TEMPLATE_ID,
        sender: MSG91_SENDER_ID,
        short_url: "0",
        recipients: [
          {
            mobiles: indianMobile(input.to),
            OTP: input.otp,
            otp: input.otp,
          },
        ],
      }),
    });

    const message = stringField(response.body, "message");
    const rejected = response.body?.type === "error";
    if (!response.ok || rejected) {
      throw new Error(
        `MSG91 returned HTTP ${response.status}${message ? `: ${message}` : "."}`,
      );
    }

    return {
      providerMessageId: stringField(response.body, "jobId"),
      raw: response.body,
    };
  }
}

/** "+919876543210" -> "9876543210" (the Flow API's Indian format). */
function indianMobile(to: string): string {
  const digits = to.startsWith("+") ? to.slice(1) : to;
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}
