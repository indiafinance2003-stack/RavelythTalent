import { handleApi, jsonOk } from "@/lib/http";
import { processCampaigns } from "@/lib/assistant/process-campaigns";
import { markNoReplyLeads } from "@/lib/assistant/no-reply";
import { assertCronRequest } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await processCampaigns();
  const noReply = await markNoReplyLeads();
  return jsonOk({
    job: "process-campaigns",
    at: new Date().toISOString(),
    result,
    noReply,
  });
});
