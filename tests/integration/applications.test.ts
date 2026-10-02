import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures } from '../support/fixtures';
import {
  applyToJob,
  getApplicationHistory,
  listAllApplications,
  listCandidateApplications,
  listCompanyApplications,
  updateApplicationStatus,
} from '@/lib/portal/applications';
import { jobApplications } from '@/lib/db/portal-schema';

/**
 * REAL database tests for the application workflow (test items 31-39).
 *
 * The guarantees under test are tenant isolation and pipeline integrity, so
 * they are exercised against PostgreSQL rather than a mock.
 */
describe('applications (real database)', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  beforeAll(async () => {
    db = await createTestDatabase();
    installTestDatabase(db);
    fx = new PortalFixtures(db);
  });

  afterAll(async () => {
    restoreDatabase();
    await db.$client.close();
  });

  async function publishedJob(companyId: string, overrides = {}) {
    return fx.job({ companyId, status: 'published', ...overrides });
  }

  it('lets a candidate apply to a published job', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId);

    const application = await applyToJob({
      candidateProfileId: candidateId,
      jobId,
      coverLetter: 'I would love to help.',
    });

    expect(application.status).toBe('applied');
    expect(application.candidateId).toBe(candidateId);
    expect(application.jobId).toBe(jobId);
    expect(application.companyName).toBe('Acme');

    // The initial status is recorded in history.
    const history = await getApplicationHistory(application.id);
    expect(history).toHaveLength(1);
    expect(history[0].toStatus).toBe('applied');
    expect(history[0].fromStatus).toBeNull();
  });

  it('blocks a duplicate application from the same candidate', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId);

    await applyToJob({ candidateProfileId: candidateId, jobId });

    await expect(applyToJob({ candidateProfileId: candidateId, jobId })).rejects.toThrow(
      /already applied/i
    );
    expect(await db.select().from(jobApplications)).toHaveLength(1);
  });

  it('blocks an application to a non-published job', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { companyId } = await fx.employerWithCompany('Acme');

    for (const status of ['draft', 'pending_approval', 'closed', 'rejected', 'expired']) {
      const jobId = await fx.job({ companyId, status });
      await expect(
        applyToJob({ candidateProfileId: candidateId, jobId })
      ).rejects.toThrowError(/not found/i);
    }
  });

  it('blocks an application after the deadline has passed', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId, {
      applicationDeadline: new Date(Date.now() - 86_400_000),
    });

    await expect(applyToJob({ candidateProfileId: candidateId, jobId })).rejects.toThrow(
      /deadline.*has passed/i
    );
  });

  it('blocks an application to a job whose posting expired', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId, { expiresAt: new Date(Date.now() - 1000) });

    await expect(applyToJob({ candidateProfileId: candidateId, jobId })).rejects.toThrow(
      /expired/i
    );
  });

  it('shows an employer only the applications to their own jobs', async () => {
    await truncateAllTables(db);
    const candidateA = await fx.candidate('Alice');
    const candidateB = await fx.candidate('Bob');
    const acme = await fx.employerWithCompany('Acme');
    const other = await fx.employerWithCompany('Other Co');

    const acmeJob = await publishedJob(acme.companyId);
    const otherJob = await publishedJob(other.companyId);

    await applyToJob({ candidateProfileId: candidateA, jobId: acmeJob });
    await applyToJob({ candidateProfileId: candidateB, jobId: otherJob });

    const acmeApplications = await listCompanyApplications(acme.companyId);
    expect(acmeApplications).toHaveLength(1);
    expect(acmeApplications[0].candidateName).toBe('Alice');

    const otherApplications = await listCompanyApplications(other.companyId);
    expect(otherApplications).toHaveLength(1);
    expect(otherApplications[0].candidateName).toBe('Bob');
  });

  it('stops an employer changing an application belonging to another company', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const acme = await fx.employerWithCompany('Acme');
    const other = await fx.employerWithCompany('Other Co');
    const jobId = await publishedJob(acme.companyId);

    const application = await applyToJob({ candidateProfileId: candidateId, jobId });

    // The other company guesses the application id.
    await expect(
      updateApplicationStatus({
        applicationId: application.id,
        nextStatus: 'rejected',
        companyId: other.companyId,
        changedByUserId: other.userId,
      })
    ).rejects.toThrowError(/not found/i);

    // It is genuinely unchanged.
    const [row] = await db.select().from(jobApplications).where(eq(jobApplications.id, application.id));
    expect(row.status).toBe('applied');
  });

  it('lets an employer advance an application on their own job', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { userId, companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId);
    const application = await applyToJob({ candidateProfileId: candidateId, jobId });

    const updated = await updateApplicationStatus({
      applicationId: application.id,
      nextStatus: 'shortlisted',
      companyId,
      changedByUserId: userId,
      note: 'Strong match on skills.',
    });

    expect(updated.status).toBe('shortlisted');

    const history = await getApplicationHistory(application.id);
    expect(history.map((h) => h.toStatus)).toEqual(['applied', 'shortlisted']);
    expect(history[1].fromStatus).toBe('applied');
    expect(history[1].note).toBe('Strong match on skills.');
    expect(history[1].createdAt).toBeTruthy();
  });

  it('lets an admin review an application across the platform', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId);
    const application = await applyToJob({ candidateProfileId: candidateId, jobId });

    const updated = await updateApplicationStatus({
      applicationId: application.id,
      nextStatus: 'hired',
      isAdmin: true,
      changedByUserId: await fx.user('admin'),
    });
    expect(updated.status).toBe('hired');

    const all = await listAllApplications();
    expect(all).toHaveLength(1);
  });

  it('rejects an unknown application status', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { userId, companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId);
    const application = await applyToJob({ candidateProfileId: candidateId, jobId });

    await expect(
      updateApplicationStatus({
        applicationId: application.id,
        // A value straight from the client that is not a real status.
        nextStatus: 'hired_immediately' as never,
        companyId,
        changedByUserId: userId,
      })
    ).rejects.toThrowError(/unsupported application status/i);
  });

  it('shows a candidate only their own applications', async () => {
    await truncateAllTables(db);
    const alice = await fx.candidate('Alice');
    const bob = await fx.candidate('Bob');
    const { companyId } = await fx.employerWithCompany('Acme');
    const jobOne = await publishedJob(companyId);
    const jobTwo = await publishedJob(companyId);

    await applyToJob({ candidateProfileId: alice, jobId: jobOne });
    await applyToJob({ candidateProfileId: bob, jobId: jobTwo });
    await applyToJob({ candidateProfileId: alice, jobId: jobTwo });

    expect(await listCandidateApplications(alice)).toHaveLength(2);
    expect(await listCandidateApplications(bob)).toHaveLength(1);
  });

  it('records every status change in history, in order', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { userId, companyId } = await fx.employerWithCompany('Acme');
    const jobId = await publishedJob(companyId);
    const application = await applyToJob({ candidateProfileId: candidateId, jobId });

    for (const status of ['shortlisted', 'interview', 'selected', 'hired'] as const) {
      await updateApplicationStatus({
        applicationId: application.id,
        nextStatus: status,
        companyId,
        changedByUserId: userId,
      });
    }

    const history = await getApplicationHistory(application.id);
    expect(history.map((h) => h.toStatus)).toEqual([
      'applied',
      'shortlisted',
      'interview',
      'selected',
      'hired',
    ]);
    // Each row records where it came from.
    expect(history.map((h) => h.fromStatus)).toEqual([
      null,
      'applied',
      'shortlisted',
      'interview',
      'selected',
    ]);
  });

  it('filters a company application list by status and job', async () => {
    await truncateAllTables(db);
    const c1 = await fx.candidate('One');
    const c2 = await fx.candidate('Two');
    const { userId, companyId } = await fx.employerWithCompany('Acme');
    const jobOne = await publishedJob(companyId);
    const jobTwo = await publishedJob(companyId);

    const a1 = await applyToJob({ candidateProfileId: c1, jobId: jobOne });
    await applyToJob({ candidateProfileId: c2, jobId: jobTwo });
    await updateApplicationStatus({
      applicationId: a1.id,
      nextStatus: 'rejected',
      companyId,
      changedByUserId: userId,
    });

    expect(await listCompanyApplications(companyId, { status: 'rejected' })).toHaveLength(1);
    expect(await listCompanyApplications(companyId, { jobId: jobTwo })).toHaveLength(1);
  });
  it('scopes application history to the owning company', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { userId, companyId } = await fx.employerWithCompany('Owner Ltd');
    const { companyId: rivalCompanyId } = await fx.employerWithCompany('Rival Ltd');

    const jobId = await publishedJob(companyId);
    const application = await applyToJob({ candidateProfileId: candidateId, jobId });
    await updateApplicationStatus({
      applicationId: application.id,
      nextStatus: 'shortlisted',
      companyId,
      changedByUserId: userId,
    });

    // The owner sees the full pipeline.
    const own = await getApplicationHistory(application.id, companyId);
    expect(own.length).toBeGreaterThan(0);

    // A rival employer guessing the application id must be told it does not
    // exist, rather than being handed the other company's hiring decisions.
    await expect(getApplicationHistory(application.id, rivalCompanyId)).rejects.toThrowError(
      /not found/i
    );

    // Admin oversight is the one deliberate exception.
    const asAdmin = await getApplicationHistory(application.id, rivalCompanyId, { isAdmin: true });
    expect(asAdmin.length).toBe(own.length);
  });
});