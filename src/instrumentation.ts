/**
 * Next.js instrumentation hook - runs once when the server boots.
 * Used for strict environment validation.
 */
export async function register(): Promise<void> {
  const { assertEnv } = await import("@/lib/env");
  assertEnv();
}
