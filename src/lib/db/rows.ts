import 'server-only';

/**
 * Reads rows out of a raw `db.execute()` result in a driver-agnostic way.
 *
 * Drizzle drivers differ in what `execute()` resolves to: postgres-js resolves
 * to the row array itself, while the PGlite driver (used by the integration
 * tests) resolves to `{ rows: [...] }`. Reading rows naively therefore returns
 * an empty result on one driver or the other.
 *
 * Normalising in one place keeps every service portable and means the exact
 * production SQL is what the integration tests execute.
 */
export function rowsFromExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}
