import { and, asc, count, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { TestDatabase } from './database';
import { buildJobPredicates } from '@/lib/portal/jobs/filters';
import {
  candidateProfiles,
  companies,
  employerProfiles,
  jobApplications,
  jobPackages,
  jobs,
  orders,
  savedJobs,
  users,
} from '@/lib/db/schema';

/**
 * Shared seeding helpers for portal integration tests.
 *
 * Every helper inserts real rows through Drizzle so database constraints are
 * genuinely exercised rather than bypassed.
 */
export class PortalFixtures {
  constructor(private readonly db: TestDatabase) {}

  /** Creates a user with a real unique email. Returns the user id. */
  async user(role: string, name = 'Test User'): Promise<string> {
    const [row] = await this.db
      .insert(users)
      .values({
        email: `${role}-${crypto.randomUUID()}@example.com`,
        passwordHash: 'argon2-hash',
        name,
        role,
      })
      .returning({ id: users.id });
    return row.id;
  }

  /** Creates a candidate user plus its profile. Returns the candidate id. */
  async candidate(name = 'Jane Doe'): Promise<string> {
    const userId = await this.user('candidate', name);
    const [row] = await this.db
      .insert(candidateProfiles)
      .values({ userId, fullName: name })
      .returning({ id: candidateProfiles.id });
    return row.id;
  }

  employer(): Promise<string> {
    return this.user('employer');
  }

  /** Creates an employer user bound to a fresh company. */
  async employerWithCompany(name = 'Acme'): Promise<{ userId: string; companyId: string }> {
    const userId = await this.user('employer');
    const companyId = await this.company(name);
    await this.db.insert(employerProfiles).values({ userId, companyId });
    return { userId, companyId };
  }

  async company(name = 'Acme'): Promise<string> {
    const [row] = await this.db
      .insert(companies)
      .values({ name, slug: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}` })
      .returning({ id: companies.id });
    return row.id;
  }

  /**
   * Creates a job. When `overrides.companyId` is supplied the caller's company
   * is reused and no extra employer/company rows are created; otherwise a fresh
   * employer + company pair is provisioned.
   */
  async job(overrides: Partial<typeof jobs.$inferInsert> = {}): Promise<string> {
    const provision = overrides.companyId
      ? null
      : await this.employerWithCompany('Acme');
    const [row] = await this.db
      .insert(jobs)
      .values({
        companyId: overrides.companyId ?? provision!.companyId,
        createdByUserId: provision?.userId ?? (await this.employer()),
        title: 'Backend Engineer',
        description: 'Build and maintain services.',
        status: 'published',
        publishedAt: new Date(),
        ...overrides,
      })
      .returning({ id: jobs.id });
    return row.id;
  }

  async package(overrides: Partial<typeof jobPackages.$inferInsert> = {}): Promise<string> {
    const [row] = await this.db
      .insert(jobPackages)
      .values({
        code: `pkg-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Starter',
        priceMinor: 99000,
        credits: 5,
        ...overrides,
      })
      .returning({ id: jobPackages.id });
    return row.id;
  }

  async order(overrides: Partial<typeof orders.$inferInsert> = {}): Promise<string> {
    const userId = overrides.userId ?? (await this.user('employer'));
    const companyId = overrides.companyId ?? (await this.company());
    const packageId = overrides.packageId ?? (await this.package());
    const [row] = await this.db
      .insert(orders)
      .values({
        orderNumber: `ORD-${crypto.randomUUID().slice(0, 12)}`,
        companyId,
        userId,
        packageId,
        amountMinor: 99000,
        ...overrides,
      })
      .returning({ id: orders.id });
    return row.id;
  }

  application(jobId: string, candidateId: string): Promise<string> {
    return this.db
      .insert(jobApplications)
      .values({ jobId, candidateId })
      .returning({ id: jobApplications.id })
      .then(([row]) => row.id);
  }

  saveJob(candidateId: string, jobId: string): Promise<void> {
    return this.db.insert(savedJobs).values({ candidateId, jobId }).then(() => undefined);
  }
}

/** Typed helper so tests can compare a uuid column without repeating `eq`. */
export function idEquals(column: AnyPgColumn, value: string) {
  return eq(column, value);
}

/**
 * Runs the production job-search predicate builder against the database and
 * returns matching job ids in a stable order.
 *
 * Tests use this so they exercise exactly the SQL the application runs, rather
 * than a reimplementation that could silently drift from it.
 */
export async function runJobSearch(
  db: TestDatabase,
  filters: Parameters<typeof buildJobPredicates>[0]
): Promise<string[]> {
  const where = and(...buildJobPredicates(filters));
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(where)
    .orderBy(asc(jobs.id));
  return rows.map((row) => row.id);
}

/** Counts matches with the same predicate, proving totals match the rows. */
export async function countJobSearch(
  db: TestDatabase,
  filters: Parameters<typeof buildJobPredicates>[0]
): Promise<number> {
  const where = and(...buildJobPredicates(filters));
  const [row] = await db
    .select({ value: count() })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(where);
  return row?.value ?? 0;
}

/**
 * Extracts the PostgreSQL SQLSTATE code from a rejected query.
 *
 * Drizzle wraps driver errors in a `DrizzleQueryError`, so the original
 * `{ code: '23505' }` lives on `.cause`.
 */
export function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Asserts a statement failed because of a unique/primary key violation. */
export function expectUniqueViolation(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => {
      throw new Error('Expected a unique constraint violation, but the statement succeeded.');
    },
    (error: unknown) => {
      expect(postgresErrorCode(error)).toBe('23505');
    }
  );
}

/** Asserts a statement failed because of a foreign key violation. */
export function expectForeignKeyViolation(promise: Promise<unknown>): Promise<void> {
  return promise.then(
    () => {
      throw new Error('Expected a foreign key violation, but the statement succeeded.');
    },
    (error: unknown) => {
      expect(postgresErrorCode(error)).toBe('23503');
    }
  );
}
