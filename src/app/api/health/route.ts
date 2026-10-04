import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { envError } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + database connectivity probe used by the deploy smoke test. */
export async function GET() {
  const started = Date.now();
  const configError = envError();
  if (configError) {
    return NextResponse.json(
      { status: "error", database: "not_configured", message: configError },
      { status: 503 },
    );
  }

  try {
    await db.execute(sql`select 1 as ok`);
    return NextResponse.json(
      {
        status: "ok",
        database: "up",
        latencyMs: Date.now() - started,
        time: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error("[health] database connectivity check failed.");
    } else {
      console.error("[health] database connectivity check failed:", error);
    }
    return NextResponse.json(
      {
        status: "error",
        database: "down",
        latencyMs: Date.now() - started,
        message:
          process.env.NODE_ENV === "production"
            ? "Database connectivity check failed."
            : error instanceof Error
              ? error.message
              : "unknown error",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
