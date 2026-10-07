import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { syncConfiguredInboxes } from "@/lib/assistant/sync-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await syncConfiguredInboxes();
  return jsonOk({
    job: "sync-inbox",
    at: new Date().toISOString(),
    result,
  });
});
