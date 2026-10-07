import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { processSocialPosts } from "@/lib/social/process-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await processSocialPosts();
  return jsonOk({
    job: "process-social-posts",
    at: new Date().toISOString(),
    result,
  });
});
