import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Drizzle / node-postgres client.
 *
 * The pool is created lazily so that `next build` (which imports route modules
 * without connecting) never tries to open a database connection, and so the
 * process reuses a single pool across hot reloads in development.
 */

type GlobalWithPool = typeof globalThis & {
  __ravelythPool?: Pool;
  __ravelythDb?: NodePgDatabase<typeof schema>;
};

const globalForDb = globalThis as GlobalWithPool;

function createPool(): Pool {
  const { DATABASE_URL } = getEnv();
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false,
  });
  pool.on("error", (err) => {
    console.error("[db] unexpected idle client error", err);
  });
  return pool;
}

export function getPool(): Pool {
  if (!globalForDb.__ravelythPool) {
    globalForDb.__ravelythPool = createPool();
  }
  return globalForDb.__ravelythPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb.__ravelythDb) {
    globalForDb.__ravelythDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__ravelythDb;
}

/**
 * `db` behaves like the drizzle instance but resolves the connection lazily.
 * Calls are bound to the real instance so the query builder `this` is correct.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop as string];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : Reflect.get(real, prop, receiver);
  },
  has(_target, prop) {
    return prop in (getDb() as unknown as object);
  },
});

export type Database = NodePgDatabase<typeof schema>;
export { schema };
