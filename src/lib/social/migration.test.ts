import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for migration 0016 (Task 9) - production safety and dedupe.
 *
 * The live database already has real data, so this migration must only ever
 * ADD tables, columns, constraints and indexes. It also carries the unique
 * (job_id, platform) index that gives per-job/per-platform dedupe.
 */

const drizzleDir = path.join(process.cwd(), "drizzle");

const journal = JSON.parse(
  readFileSync(path.join(drizzleDir, "meta", "_journal.json"), "utf8"),
) as { entries: { idx: number; tag: string }[] };

const entry = journal.entries.find((item) => item.idx === 16);
const migrationSql = entry
  ? readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8")
  : "";

const statements = migrationSql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

const createdTables = statements
  .filter((statement) => statement.startsWith("CREATE TABLE"))
  .map((statement) => /^CREATE TABLE "([^"]+)"/.exec(statement)?.[1] ?? "");

describe("migration 0016 (social posting)", () => {
  it("exists as a journal entry after migration 0015", () => {
    expect(entry).toBeDefined();
    expect(migrationSql.length).toBeGreaterThan(0);
    // Note: later phases may append newer migrations; this guard checks that
    // 0016 is present and keeps its position in the journal order.
    const index = journal.entries.findIndex((item) => item.idx === 16);
    expect(index).toBeGreaterThan(0);
    expect(journal.entries[index - 1]?.idx).toBe(15);
  });

  it("is additive only - nothing that can lose data", () => {
    expect(createdTables).toEqual(["social_posts", "social_settings", "whatsapp_digests"]);
    expect(migrationSql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|SCHEMA)/i);
    expect(migrationSql).not.toMatch(/DELETE\s+FROM/i);
    expect(migrationSql).not.toMatch(/TRUNCATE/i);
    expect(migrationSql).not.toMatch(/\bRENAME\b/i);
    expect(migrationSql).not.toMatch(/\bUPDATE\s+"/i);
    for (const statement of statements) {
      if (/^ALTER TABLE/i.test(statement)) {
        expect(statement).toMatch(/^ALTER TABLE\s+"[a-z_]+"\s+ADD\b/i);
      }
    }
  });

  it("adds the company opt-out column as boolean default false not null", () => {
    expect(migrationSql).toContain(
      `ALTER TABLE "companies" ADD COLUMN "social_promotion_opt_out" boolean DEFAULT false NOT NULL`,
    );
  });

  it("deduplicates one queued post per job and platform", () => {
    expect(migrationSql).toContain(
      `CREATE UNIQUE INDEX "social_posts_job_platform_key" ON "social_posts" USING btree ("job_id","platform")`,
    );
    expect(migrationSql).toContain(`CREATE INDEX "social_posts_status_next_idx"`);
  });

  it("ships the documented defaults (master switch off, cap 10, spacing 20, window 09:00-21:00)", () => {
    expect(migrationSql).toMatch(/"enabled" boolean DEFAULT false NOT NULL/);
    expect(migrationSql).toMatch(/"pause_all" boolean DEFAULT false NOT NULL/);
    expect(migrationSql).toMatch(/"max_posts_per_day" integer DEFAULT 10 NOT NULL/);
    expect(migrationSql).toMatch(/"min_minutes_between_posts" integer DEFAULT 20 NOT NULL/);
    expect(migrationSql).toMatch(/"window_start" text DEFAULT '09:00' NOT NULL/);
    expect(migrationSql).toMatch(/"window_end" text DEFAULT '21:00' NOT NULL/);
  });

  it("never stores credentials in the database", () => {
    expect(migrationSql).not.toMatch(/token text|access_token|page_token|secret/i);
  });
});
