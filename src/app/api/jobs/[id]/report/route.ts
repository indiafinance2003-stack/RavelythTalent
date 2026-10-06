import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestIp, assertSameOrigin } from "@/lib/security";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import { createJobReport } from "@/lib/jobs/reports";
import { handleApi, jsonCreated, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportSchema = z.object({
  reason: z.enum([
    "scam_or_asks_for_money",
    "fake_or_already_filled",
    "discriminatory",
    "other",
  ]),
  note: z.string().trim().max(1000).optional(),
});

export const POST = handleApi(async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  await assertSameOrigin();
  const { id } = await context.params;
  const payload = reportSchema.parse(await readJson(request));
  const user = await getSessionUser();
  const ip = (await getRequestIp()) ?? "unknown";

  await enforceRateLimit(rateKey("jobReportIp", ip), RATE_LIMITS.jobReportIp);
  if (user) {
    await enforceRateLimit(
      rateKey("jobReportUser", user.id),
      RATE_LIMITS.jobReportUser,
    );
  }
  await createJobReport({
    jobId: z.uuid().parse(id),
    userId: user?.id ?? null,
    ip,
    reason: payload.reason,
    note: payload.note || null,
  });
  return jsonCreated({ submitted: true });
});
