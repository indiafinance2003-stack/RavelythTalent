import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { unsubscribeByToken } from "@/lib/alerts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-click unsubscribe from job-alert emails. */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = await unsubscribeByToken(token);

  const target = new URL(
    ok ? "/dashboard/alerts?unsubscribed=1" : "/dashboard/alerts?unsubscribed=0",
    getEnv().APP_URL,
  );
  return NextResponse.redirect(target, 302);
}
