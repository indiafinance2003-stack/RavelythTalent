import { unsubscribeByToken } from "@/lib/alerts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-click unsubscribe from job-alert emails. */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = await unsubscribeByToken(token);
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Job alert preferences</title><body><main><h1>${ok ? "You have unsubscribed" : "Link unavailable"}</h1><p>${ok ? "Job-alert emails are turned off for this account." : "This unsubscribe link is invalid or has already expired."}</p><a href="/">Return to Ravelyth Talent</a></main></body></html>`,
    {
      status: ok ? 200 : 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}
