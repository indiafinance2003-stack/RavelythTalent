import { handleApi, jsonOk } from "@/lib/http";
import { assertCronRequest } from "@/lib/security";
import { runScheduledCrawl } from "@/lib/assistant/crawl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await assertCronRequest();
  const result = await runScheduledCrawl();
  return jsonOk({
    job: "crawl-targets",
    at: new Date().toISOString(),
    enabled: result.enabled,
    crawled: result.crawled,
    outcomes: result.outcomes.map((outcome) => ({
      targetId: outcome.targetId,
      status: outcome.status,
      emailsFound: outcome.emailsFound,
      pagesCrawled: outcome.pagesCrawled,
      contactFormUrl: outcome.contactFormUrl,
      error: outcome.error,
    })),
  });
});
