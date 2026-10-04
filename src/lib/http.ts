import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, RateLimitError } from "@/lib/errors";

/**
 * Uniform JSON envelope + error translation for Route Handlers.
 *
 *   success -> { "ok": true,  "data": ... }
 *   failure -> { "ok": false, "error": { "code", "message", "issues"? } }
 */

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonCreated<T>(data: T): NextResponse {
  return jsonOk(data, 201);
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_failed",
          message: "The submitted data is invalid.",
          issues: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  if (error instanceof AppError) {
    const headers: Record<string, string> = {};
    if (error instanceof RateLimitError) {
      headers["Retry-After"] = String(error.retryAfterSeconds);
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.issues ? { issues: error.issues } : {}),
        },
      },
      { status: error.status, headers },
    );
  }

  console.error("[api] unhandled error:", error);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown AppErrors become correct JSON responses. */
export function handleApi<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Reads and validates JSON request bodies. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("Request body must be valid JSON.", 400, "invalid_json");
  }
}