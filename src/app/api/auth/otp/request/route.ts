import { assertSameOrigin, getRequestIp } from "@/lib/security";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import { handleApi, jsonOk, readJson } from "@/lib/http";
import { otpRequestSchema } from "@/lib/validation/auth";
import { sendOtp } from "@/lib/auth/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/otp/request - sends a 6-digit OTP to an Indian mobile. */
export const POST = handleApi(async (request: Request) => {
  await assertSameOrigin();

  const ip = (await getRequestIp()) ?? "unknown";
  await enforceRateLimit(rateKey("otpRequest", ip), RATE_LIMITS.otpRequest);

  const body = otpRequestSchema.parse(await readJson(request));
  await enforceRateLimit(
    rateKey("otpRequest", body.phone),
    RATE_LIMITS.otpRequest,
  );

  await sendOtp(body.phone, body.purpose);

  return jsonOk({
    phone: body.phone,
    message: "We sent a 6-digit code. It expires in 5 minutes.",
  });
});