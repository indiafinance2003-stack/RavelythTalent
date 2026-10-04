import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { expireJobs } from "@/lib/cron/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Closes published jobs past their deadline. Called hourly.
 *
 * Internal endpoint: requires a constant-time match of the CRON_SECRET header
 * and a loopback caller. Systemd timers call this every minute/hour/day - see
 * deploy/systemd/.
 */
export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await expireJobs();
  return jsonOk({ job: "expire-jobs", at: new Date().toISOString(), result });
});
