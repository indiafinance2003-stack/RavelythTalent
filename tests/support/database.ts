import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '@/lib/db/schema';
import type { AppDatabase, Database } from '@/lib/db';
import { setDatabaseForTests } from '@/lib/db/request';

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

/**
 * Installs this test database as the application's database for the duration of
 * a test, so the REAL service code (payments, credits, applications, ...) can be
 * exercised end-to-end instead of being mocked.
 *
 * Call `restoreDatabase` in afterEach/afterAll.
 */
export function installTestDatabase(db: TestDatabase): void {
  // The PGlite handle is a real Drizzle database with the same query interface
  // the application uses, so the services under test run unmodified.
  setDatabaseForTests({
    db: db as unknown as AppDatabase,
    sql: db.$client as unknown as Database['sql'],
  });
}

/** Removes the test-installed database. */
export function restoreDatabase(): void {
  setDatabaseForTests(undefined);
}

/**
 * Seeded reference tables, which are catalogue data rather than test data.
 *
 * They are populated by migrations and every test expects them present (plan
 * prices, the five resume templates, the entitlement codes). Truncating them
 * would silently turn "candidate has no premium plan" into "the premium
 * catalogue vanished", so they are excluded.
 */
const SEEDED_REFERENCE_TABLES = [
  'premium_entitlements',
  'candidate_premium_plans',
  'candidate_premium_plan_entitlements',
  'recruiter_plans',
  'recruiter_plan_features',
  'resume_templates',
] as const;

/**
 * Removes all test-owned rows while keeping the schema and the seeded
 * reference tables, so each test starts clean.
 *
 * Consequence: a test that INSERTS into a seeded reference table must clean up
 * after itself, because the next `truncateAllTables` will not remove it.
 */
export async function truncateAllTables(db: TestDatabase): Promise<void> {
  await db.$client.exec(`
    DO $$
    DECLARE
      stmt text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(quote_ident(tablename), ', ') || ' CASCADE'
        INTO stmt
        FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename <> ALL (ARRAY[${SEEDED_REFERENCE_TABLES.map((t) => `'${t}'`).join(', ')}]::text[]);
      IF stmt IS NOT NULL THEN
        EXECUTE stmt;
      END IF;
    END $$;
  `);
}

