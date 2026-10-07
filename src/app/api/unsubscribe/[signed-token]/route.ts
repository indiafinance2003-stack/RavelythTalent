import { getEnv } from "@/lib/env";
import { applyCampaignUnsubscribe } from "@/lib/assistant/apply-unsubscribe";
import { verifyUnsubscribeToken } from "@/lib/assistant/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ "signed-token": string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const body = await request.text();
  if (body !== "List-Unsubscribe=One-Click") {
    return new Response("Invalid unsubscribe request.", { status: 400 });
  }
  const { "signed-token": token } = await context.params;
  const verified = verifyUnsubscribeToken(token, getEnv().SESSION_SECRET);
  if (!verified) return new Response("Unsubscribe link is invalid or expired.", { status: 400 });
  await applyCampaignUnsubscribe(verified.email);
  return new Response(null, { status: 204 });
}
