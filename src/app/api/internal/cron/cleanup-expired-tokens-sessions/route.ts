import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { cleanupExpiredData } from "@/lib/cron/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Removes expired tokens, sessions, OTPs and rate-limit buckets. Called daily.
 *
 * Internal endpoint: requires a constant-time match of the CRON_SECRET header
 * and a loopback caller. Systemd timers call this every minute/hour/day - see
 * deploy/systemd/.
 */
export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await cleanupExpiredData();
  return jsonOk({ job: "cleanup-expired-tokens-sessions", at: new Date().toISOString(), result });
});
