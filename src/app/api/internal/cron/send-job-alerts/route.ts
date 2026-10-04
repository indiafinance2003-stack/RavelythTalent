import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { sendJobAlertEmails } from "@/lib/cron/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends due job alerts (daily/weekly). Called once a day.
 *
 * Internal endpoint: requires a constant-time CRON_SECRET match. Network
 * access is restricted by loopback binding and the public Nginx deny rule.
 */
export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await sendJobAlertEmails();
  return jsonOk({ job: "send-job-alerts", at: new Date().toISOString(), result });
});
