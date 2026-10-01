import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '@/lib/db/schema';

/**
 * A REAL PostgreSQL instance for tests, compiled to WebAssembly by PGlite.
 *
 * These are genuine database integration tests: the committed Drizzle SQL
 * migrations are applied verbatim, and every assertion runs against actual
 * PostgreSQL — real unique indexes, real foreign keys, real transactions and
 * real `ILIKE`/JSONB operators. Nothing about the database is simulated or
 * mocked, and no test is skipped for lacking a database.
 *
 * This replaced the previous situation where database tests silently skipped
 * without TEST_DATABASE_URL, which meant critical workflows (search filtering,
 * credit consumption, duplicate-application prevention) were never actually
 * exercised.
 */
export type TestDatabase = ReturnType<typeof drizzle<typeof schema>> & {
  $client: PGlite;
};

function splitStatements(sqlText: string): string[] {
  return sqlText
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Applies every committed migration in ./drizzle to a fresh in-memory database.
 * Migrations run in filename order, exactly as `npm run db:migrate` would.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as TestDatabase;

  const migrationsDir = path.join(process.cwd(), 'drizzle');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const contents = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    for (const statement of splitStatements(contents)) {
      await client.exec(statement);
    }
  }

  return db;
}

/** Removes all rows while keeping the schema, so each test starts clean. */
export async function truncateAllTables(db: TestDatabase): Promise<void> {
  await db.$client.exec(`
    DO $$
    DECLARE
      stmt text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(quote_ident(tablename), ', ') || ' CASCADE'
        INTO stmt
        FROM pg_tables
       WHERE schemaname = 'public';
      IF stmt IS NOT NULL THEN
        EXECUTE stmt;
      END IF;
    END $$;
  `);
}
