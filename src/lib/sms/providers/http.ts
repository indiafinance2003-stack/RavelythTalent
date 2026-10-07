/** Shared HTTP helper for the SMS provider adapters. */

export const SMS_REQUEST_TIMEOUT_MS = 15_000;

export type SmsHttpResult = {
  status: number;
  ok: boolean;
  body: Record<string, unknown> | null;
};

/**
 * Performs a request with an explicit timeout and parses a JSON body.
 * Transport failures are re-thrown as plain Errors (never AppError) so the
 * OTP caller surfaces one generic "could not send OTP" message without
 * leaking provider internals.
 */
export async function smsFetch(
  url: string,
  init: RequestInit,
): Promise<SmsHttpResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`SMS request failed: ${reason}`);
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { status: response.status, ok: response.ok, body };
}

/** Reads a string field from a parsed provider response body. */
export function stringField(
  body: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = body?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
