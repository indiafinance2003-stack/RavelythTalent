import 'server-only';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { getDatabase, type Database } from './index';

/**
 * TEST-ONLY database override.
 *
 * Integration tests run against an in-process PostgreSQL (PGlite) instance that
 * has no connection string, so the services under test would otherwise fail with
 * "DATABASE_URL is not configured". This lets a test install its own
 * already-migrated database handle so the REAL service code can be exercised.
 *
 * It lives in this leaf module (which imports nothing from the db layer) so that
 * `dbFromRequest()` can re-export it without creating an import cycle.
 *
 * It is deliberately hard to misuse:
 *  - it throws in production, so a live request can never reach it;
 *  - it is only accepted while a test runner is active.
 *
 * Production code must never call this.
 */
let testDatabaseOverride: Database | undefined;

export function setDatabaseForTests(override: Database | undefined): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setDatabaseForTests must never be used in production.');
  }
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    throw new Error('setDatabaseForTests is only available inside tests.');
  }
  testDatabaseOverride = override;
}

/** Returns the test-installed database, if any. */
export function getTestDatabase(): Database | undefined {
  return testDatabaseOverride;
}

/**
 * Returns the database connection or throws a user-safe 503 AppError when
 * PostgreSQL is not configured. API routes use this so that account features
 * degrade with a clear message instead of an internal error, while public
 * job-board pages remain readable without a database.
 */
export function requireDatabase(): Database {
  const testDatabase = getTestDatabase();
  if (testDatabase) return testDatabase;

  try {
    return getDatabase();
  } catch (error) {
    if (error instanceof Error && error.name === 'DatabaseNotConfiguredError') {
      throw new AppError(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'Account features are temporarily unavailable. Public tools remain available.',
        503
      );
    }
    throw error;
  }
}
