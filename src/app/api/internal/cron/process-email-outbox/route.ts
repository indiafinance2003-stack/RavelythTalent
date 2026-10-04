import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { processEmailOutbox } from "@/lib/email/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drains the email outbox. Called every minute.
 *
 * Internal endpoint: requires a constant-time match of the CRON_SECRET header
 * and a loopback caller. Systemd timers call this every minute/hour/day - see
 * deploy/systemd/.
 */
export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await processEmailOutbox(50);
  return jsonOk({ job: "process-email-outbox", at: new Date().toISOString(), result });
});
