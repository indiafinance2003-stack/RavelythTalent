import { handleApi, jsonOk } from "@/lib/http";
import { processCampaigns } from "@/lib/assistant/process-campaigns";
import { assertCronRequest } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await processCampaigns();
  return jsonOk({
    job: "process-campaigns",
    at: new Date().toISOString(),
    result,
  });
});
