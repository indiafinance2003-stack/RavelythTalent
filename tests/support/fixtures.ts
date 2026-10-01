import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { TestDatabase } from './database';
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

  private async user(role: string, name = 'Test User'): Promise<string> {
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

  candidate(name = 'Jane Doe'): Promise<string> {
    return this.user('candidate', name).then(async (userId) => {
      const [row] = await this.db
        .insert(candidateProfiles)
        .values({ userId, fullName: name })
        .returning({ id: candidateProfiles.id });
      return row.id;
    });
  }

  employer(): Promise<string> {
    return this.user('employer');
  }

  async company(name = 'Acme'): Promise<string> {
    const [row] = await this.db
      .insert(companies)
      .values({ name, slug: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}` })
      .returning({ id: companies.id });
    return row.id;
  }

  /** Creates an employer bound to a fresh company, returning both ids. */
  async employerWithCompany(name = 'Acme'): Promise<{
    userId: string;
    companyId: string;
  }> {
    const userId = await this.user('employer');
    const companyId = await this.company(name);
    await this.db.insert(employerProfiles).values({ userId, companyId });
    return { userId, companyId };
  }

  async job(overrides: Partial<typeof jobs.$inferInsert> = {}): Promise<string> {
    const { userId, companyId } = await this.employerWithCompany(
      overrides.companyId ? undefined : 'Acme'
    );
    const [row] = await this.db
      .insert(jobs)
      .values({
        companyId: overrides.companyId ?? companyId,
        createdByUserId: userId,
        title: 'Backend Engineer',
        description: 'Build and maintain services.',
        status: 'published',
        publishedAt: new Date(),
        ...overrides,
      })
      .returning({ id: jobs.id });
    return row.id;
  }

  package(overrides: Partial<typeof jobPackages.$inferInsert> = {}): Promise<string> {
    return this.db
      .insert(jobPackages)
      .values({
        code: `pkg-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Starter',
        priceMinor: 99000,
        credits: 5,
        ...overrides,
      })
      .returning({ id: jobPackages.id })
      .then(([row]) => row.id);
  }

  order(overrides: Partial<typeof orders.$inferInsert> = {}): Promise<string> {
    return (async () => {
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
    })();
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
 * Extracts the PostgreSQL SQLSTATE code from a rejected query.
 *
 * Drizzle wraps driver errors in a `DrizzleQueryError`, so the original
 * `{ code: '23505' }` lives on `.cause` (sometimes nested one level deeper,
 * depending on whether the driver is postgres-js or PGlite).
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

/** Asserts that a statement failed because of a unique/primary key violation. */
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

/** Asserts that a statement failed because of a foreign key violation. */
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



