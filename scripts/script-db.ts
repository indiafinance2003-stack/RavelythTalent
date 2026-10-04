import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";

/**
 * Standalone database handle for CLI scripts. Scripts intentionally do NOT run
 * the full application env validation, so that seeding works before every
 * environment variable has been filled in.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

export const pool = new Pool({ connectionString: url, max: 4 });
export const db = drizzle(pool, { schema });

export async function closeDb(): Promise<void> {
  await pool.end();
}

export function log(message: string): void {
  console.log(`[seed] ${message}`);
}
