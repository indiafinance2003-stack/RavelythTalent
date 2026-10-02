import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, truncateAllTables, type TestDatabase } from '../support/database';
import { PortalFixtures, expectUniqueViolation, idEquals } from '../support/fixtures';
import {
  applicationStatusHistory,
  candidateProfiles,
  employerProfiles,
  jobApplications,
  jobCreditLedger,
  jobs,
  savedJobs,
} from '@/lib/db/schema';

/**
 * These tests run against a REAL PostgreSQL engine (PGlite) with the committed
 * Drizzle migrations applied. They are never skipped: if a migration does not
 * apply, or a constraint does not hold, the suite fails loudly.
 */
describe('portal schema on a real PostgreSQL engine', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  beforeAll(async () => {
    db = await createTestDatabase();
    fx = new PortalFixtures(db);
  });

  afterAll(async () => {
    await db.$client.close();
  });

  it('applies every committed migration without error', async () => {
    const rows = await db.$client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    expect(rows.rows[0].count).toBeGreaterThan(40);
  });

  it('stores an application and rejects a duplicate for the same job', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const jobId = await fx.job();

    await fx.application(jobId, candidateId);

    // The unique index on (job_id, candidate_id) is the real duplicate guard.
    await expectUniqueViolation(fx.application(jobId, candidateId));
  });

  it('prevents saving the same job twice', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const jobId = await fx.job();
    await fx.saveJob(candidateId, jobId);
    await expectUniqueViolation(fx.saveJob(candidateId, jobId));
    expect(await db.select().from(savedJobs)).toHaveLength(1);
  });

  it('grants credits for an order exactly once even if the code retries', async () => {
    await truncateAllTables(db);
    const companyId = await (async () => {
      const { companyId: id } = await fx.employerWithCompany('Alpha');
      return id;
    })();
    const orderId = await fx.order({ companyId });

    await db.insert(jobCreditLedger).values({ companyId, amount: 5, reason: 'order', orderId });
    await expectUniqueViolation(
      db.insert(jobCreditLedger).values({ companyId, amount: 5, reason: 'order', orderId })
    );
  });

  it('prevents a single job from consuming credits twice', async () => {
    await truncateAllTables(db);
    const companyId = (await fx.employerWithCompany('Beta')).companyId;
    const jobId = await fx.job({ companyId });

    await db.insert(jobCreditLedger).values({ companyId, amount: -1, reason: 'job_post', jobId });
    await expectUniqueViolation(
      db.insert(jobCreditLedger).values({ companyId, amount: -1, reason: 'job_post', jobId })
    );
  });

  it('cascades a deleted candidate through applications and saved jobs', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const jobId = await fx.job();
    await fx.application(jobId, candidateId);
    await fx.saveJob(candidateId, jobId);

    await db.delete(candidateProfiles).where(idEquals(candidateProfiles.id, candidateId));

    expect(await db.select().from(jobApplications)).toHaveLength(0);
    expect(await db.select().from(savedJobs)).toHaveLength(0);
  });

  it('rolls back a transaction when credit consumption fails', async () => {
    await truncateAllTables(db);
    const companyId = (await fx.employerWithCompany('Gamma')).companyId;

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(jobCreditLedger).values({ companyId, amount: -1, reason: 'admin_adjustment' });
        throw new Error('simulated failure mid-transaction');
      })
    ).rejects.toThrow('simulated failure mid-transaction');

    // Nothing from the aborted transaction may persist.
    expect(await db.select().from(jobCreditLedger)).toHaveLength(0);
  });

  it('records application status history rows', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const jobId = await fx.job();
    const applicationId = await fx.application(jobId, candidateId);

    await db.insert(applicationStatusHistory).values({ applicationId, toStatus: 'applied' });
    await db
      .insert(applicationStatusHistory)
      .values({ applicationId, fromStatus: 'applied', toStatus: 'shortlisted' });

    const history = await db.select().from(applicationStatusHistory);
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.toStatus)).toEqual(['applied', 'shortlisted']);
  });

  it('scopes an employer to only their own company jobs', async () => {
    await truncateAllTables(db);
    const alpha = await fx.employerWithCompany('Alpha');
    const beta = await fx.employerWithCompany('Beta');
    const jobA = await fx.job({ companyId: alpha.companyId });
    const jobB = await fx.job({ companyId: beta.companyId });

    const profile = await db
      .select()
      .from(employerProfiles)
      .where(idEquals(employerProfiles.userId, alpha.userId));
    expect(profile).toHaveLength(1);

    const ownedJobIds = (
      await db.select({ id: jobs.id }).from(jobs).where(idEquals(jobs.companyId, profile[0].companyId))
    ).map((row) => row.id);

    expect(ownedJobIds).toContain(jobA);
    expect(ownedJobIds).not.toContain(jobB);
  });
});


