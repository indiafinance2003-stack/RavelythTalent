import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { runSubscriptionExpiryAndReminders } from "@/lib/cron/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expires subscriptions and sends renewal reminders. Called hourly.
 *
 * Internal endpoint: requires a constant-time match of the CRON_SECRET header
 * and a loopback caller. Systemd timers call this every minute/hour/day - see
 * deploy/systemd/.
 */
export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await runSubscriptionExpiryAndReminders();
  return jsonOk({ job: "subscription-expiry-and-reminders", at: new Date().toISOString(), result });
});
