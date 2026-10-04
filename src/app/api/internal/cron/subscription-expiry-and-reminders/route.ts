import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { runSubscriptionExpiryAndReminders } from "@/lib/cron/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expires subscriptions and sends renewal reminders. Called hourly.
 *
 * Internal endpoint: requires a constant-time CRON_SECRET match. Network
 * access is restricted by loopback binding and the public Nginx deny rule.
 */
export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await runSubscriptionExpiryAndReminders();
  return jsonOk({ job: "subscription-expiry-and-reminders", at: new Date().toISOString(), result });
});
