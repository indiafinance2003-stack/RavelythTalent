import { assertSameOrigin, getRequestIp } from "@/lib/security";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import { handleApi, jsonOk, readJson } from "@/lib/http";
import { otpVerifySchema } from "@/lib/validation/auth";
import { verifyOtp } from "@/lib/auth/otp";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { smsProviderAvailable } from "@/lib/sms";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/otp/verify - checks the code and, for `login`, creates a
 * session. For `phone_verification` it marks the current user's phone verified.
 */
export const POST = handleApi(async (request: Request) => {
  await assertSameOrigin();
  if (!smsProviderAvailable()) {
    throw new AppError(
      "Mobile OTP is not available yet. Please use email or contact support.",
      503,
      "sms_provider_unavailable",
    );
  }

  const ip = (await getRequestIp()) ?? "unknown";
  await enforceRateLimit(rateKey("otpVerify", ip), RATE_LIMITS.otpVerify);

  const body = otpVerifySchema.parse(await readJson(request));
  await enforceRateLimit(
    rateKey("otpVerify", body.phone),
    RATE_LIMITS.otpVerify,
  );

  const sessionUser = await getSessionUser();
  const result = await verifyOtp(
    body.phone,
    body.code,
    body.purpose,
    sessionUser?.id ?? null,
  );

  if (!result.ok) {
    return jsonOk({ verified: false, message: result.message }, 401);
  }

  if (body.purpose === "login" && result.userId) {
    await createSession(result.userId);
  }

  return jsonOk({
    verified: true,
    signedIn: body.purpose === "login" && Boolean(result.userId),
    phone: result.verifiedPhone,
  });
});