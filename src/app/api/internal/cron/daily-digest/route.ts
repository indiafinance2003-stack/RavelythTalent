import { handleApi, jsonOk } from "@/lib/http";
import { sendDailyDigest } from "@/lib/assistant/digest";
import { assertCronRequest } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await sendDailyDigest();
  return jsonOk({
    job: "daily-digest",
    at: new Date().toISOString(),
    result,
  });
});