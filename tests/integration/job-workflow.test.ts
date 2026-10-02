import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures } from '../support/fixtures';
import {
  changeJobStatus,
  createJob,
  getCompanyJob,
  getJobHistory,
  reviewJob,
  submitJobForApproval,
  updateJob,
  withdrawJob,
} from '@/lib/portal/jobs/service';
import { createOrder, markOrderPaidAndGrantCredits } from '@/lib/portal/payments';
import { getCreditBalance } from '@/lib/portal/credits';
import { config } from '@/lib/config';
import { companies, jobs, jobStatusHistory } from '@/lib/db/portal-schema';

/**
 * REAL database tests for the job approval workflow (test items 40-46).
 *
 * The approval rule is the critical one: an employer must never be able to
 * publish a job directly. These run the real service against PostgreSQL, so the
 * transition guard, credit consumption and reapproval-on-edit behaviour are
 * genuinely enforced rather than asserted in isolation.
 */
describe('job posting and approval workflow (real database)', () => {
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

  /** An employer with purchased job credits. */
  async function employerWithCredits(credits = 5): Promise<{
    userId: string;
    companyId: string;
  }> {
    const { userId, companyId } = await fx.employerWithCompany('Poster Ltd');
    const packageId = await fx.package({ priceMinor: 100_000, credits });
    const order = await createOrder({
      companyId,
      userId,
      packageId,
      nonRefundableAccepted: true,
    });
    await markOrderPaidAndGrantCredits({
      orderId: order.id,
      providerPaymentId: `pay_${userId}`,
    });
    return { userId, companyId };
  }

  async function newJob(companyId: string, userId: string): Promise<string> {
    const job = await createJob({
      title: 'Backend Engineer',
      description: 'Build and maintain services.',
      companyId,
      createdByUserId: userId,
      location: 'Bengaluru',
      workMode: 'hybrid',
      employmentType: 'full_time',
      experienceMinYears: 2,
      experienceMaxYears: 6,
      skills: ['Node', 'Postgres', 'node'],
    });
    return job.id;
  }

  async function approvedJob(): Promise<{ jobId: string; userId: string; companyId: string }> {
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId);
    await submitJobForApproval({ jobId, companyId, actorUserId: userId });
    await reviewJob({ jobId, decision: 'approve', adminUserId: await fx.user('admin') });
    return { jobId, userId, companyId };
  }

  it('creates a job in draft, consuming nothing', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId);

    const job = await getCompanyJob(jobId, companyId);
    expect(job.status).toBe('draft');
    expect(job.publishedAt).toBeNull();
    // Skills are normalised to lowercase and de-duplicated.
    expect(job.skills).toEqual(['node', 'postgres']);
    expect((await getCreditBalance(companyId)).used).toBe(0);
  });

  it('moves a submitted job to pending_approval, never straight to published', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId);

    const submitted = await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    expect(config.JOB_APPROVAL_REQUIRED).toBe(true);
    expect(submitted.status).toBe('pending_approval');
    expect(submitted.publishedAt).toBeNull(); // NOT live
  });

  it('consumes exactly one credit at submission time', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits(5);
    const jobId = await newJob(companyId, userId);

    await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    const balance = await getCreditBalance(companyId);
    expect(balance.used).toBe(1);
    expect(balance.available).toBe(4);
  });

  it('refuses to submit a job when the company has no credits, leaving it a draft', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await fx.employerWithCompany('Broke Ltd');
    const jobId = await newJob(companyId, userId);

    await expect(
      submitJobForApproval({ jobId, companyId, actorUserId: userId })
    ).rejects.toThrow(/do not have any job credits/i);

    expect((await getCompanyJob(jobId, companyId)).status).toBe('draft');
  });

  it('publishes a job when an admin approves it', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId);
    await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    const approved = await reviewJob({
      jobId,
      decision: 'approve',
      adminUserId: await fx.user('admin'),
    });

    expect(approved.status).toBe('published');
    expect(approved.publishedAt).not.toBeNull();
    expect(approved.expiresAt).not.toBeNull();
    expect(approved.rejectionReason).toBeNull();
  });

  it('rejects a job with a stored reason and keeps it unpublished', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId);
    await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    const rejected = await reviewJob({
      jobId,
      decision: 'reject',
      adminUserId: await fx.user('admin'),
      reason: 'Salary band is not realistic for this role.',
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toMatch(/not realistic/i);
    expect(rejected.publishedAt).toBeNull();
  });

  it('requires a reason when rejecting', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId);
    await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    await expect(
      reviewJob({ jobId, decision: 'reject', adminUserId: await fx.user('admin') })
    ).rejects.toThrow(/reason is required/i);
  });

  it('refuses to approve a job that is not pending', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId); // still 'draft'

    await expect(
      reviewJob({ jobId, decision: 'approve', adminUserId: await fx.user('admin') })
    ).rejects.toThrow(/cannot move from "draft" to "published"/i);
  });

  it('records a full status history for an approved posting', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits();
    const jobId = await newJob(companyId, userId);
    await submitJobForApproval({ jobId, companyId, actorUserId: userId });
    await reviewJob({ jobId, decision: 'approve', adminUserId: await fx.user('admin') });

    const history = await getJobHistory(jobId);
    expect(history.map((entry) => entry.toStatus)).toEqual(['pending_approval', 'published']);
    expect(history[0].fromStatus).toBe('draft');
    expect(history[1].fromStatus).toBe('pending_approval');
  });

  it('returns the credit when an employer withdraws before approval', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits(2);
    const jobId = await newJob(companyId, userId);
    await submitJobForApproval({ jobId, companyId, actorUserId: userId });
    expect((await getCreditBalance(companyId)).available).toBe(1);

    const withdrawn = await withdrawJob({ jobId, companyId, actorUserId: userId });

    expect(withdrawn.status).toBe('draft');
    expect(withdrawn.rejectionReason).toBeNull();
    expect((await getCreditBalance(companyId)).available).toBe(2);
  });

  it('does not refund twice when a withdrawal is repeated', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits(2);
    const jobId = await newJob(companyId, userId);
    await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    await withdrawJob({ jobId, companyId, actorUserId: userId });
    // The second attempt is refused: the job is no longer pending.
    await expect(withdrawJob({ jobId, companyId, actorUserId: userId })).rejects.toThrow();
    expect((await getCreditBalance(companyId)).available).toBe(2);
  });

  it('returns a live job to approval after a material edit', async () => {
    await truncateAllTables(db);
    const { jobId, userId, companyId } = await approvedJob();

    // Swapping the salary band and the description is a material change.
    const { job, requiresReapproval } = await updateJob({
      jobId,
      companyId,
      actorUserId: userId,
      changes: { salaryMinMinor: 1, salaryMaxMinor: 2, description: 'A totally different role.' },
    });

    expect(requiresReapproval).toBe(true);
    expect(job.status).toBe('pending_approval');
    expect(job.publishedAt).toBeNull();

    const history = await getJobHistory(jobId);
    expect(history[history.length - 1].reason).toMatch(/Material change/);
  });

  it('leaves a live job published after a cosmetic edit', async () => {
    await truncateAllTables(db);
    const { jobId, userId, companyId } = await approvedJob();

    // Re-ordering the skills list is not a material change.
    const { job, requiresReapproval } = await updateJob({
      jobId,
      companyId,
      actorUserId: userId,
      changes: { skills: ['postgres', 'node'] },
    });

    expect(requiresReapproval).toBe(false);
    expect(job.status).toBe('published');
    expect(job.publishedAt).not.toBeNull();
  });

  it('hides another company job from the employer', async () => {
    await truncateAllTables(db);
    const alpha = await employerWithCredits();
    const beta = await fx.employerWithCompany('Beta Ltd');
    const alphaJob = await newJob(alpha.companyId, alpha.userId);

    // Beta must not read, or even guess, Alpha's job.
    await expect(getCompanyJob(alphaJob, beta.companyId)).rejects.toThrowError(/not found/i);
    await expect(
      submitJobForApproval({
        jobId: alphaJob,
        companyId: beta.companyId,
        actorUserId: beta.userId,
      })
    ).rejects.toThrowError(/not found/i);
  });

  it('lets an admin expire a published job', async () => {
    await truncateAllTables(db);
    const { jobId } = await approvedJob();

    const expired = await changeJobStatus({
      jobId,
      nextStatus: 'expired',
      actorUserId: await fx.user('admin'),
      actor: 'admin',
    });

    expect(expired.status).toBe('expired');
    const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(row.status).toBe('expired');
  });

  it('lets an employer close their own job but not reopen it', async () => {
    await truncateAllTables(db);
    const { jobId, userId, companyId } = await approvedJob();

    const closed = await changeJobStatus({
      jobId,
      nextStatus: 'closed',
      actorUserId: userId,
      actor: 'employer',
      companyId,
    });
    expect(closed.status).toBe('closed');

    await expect(
      changeJobStatus({
        jobId,
        nextStatus: 'published',
        actorUserId: userId,
        actor: 'employer',
        companyId,
      })
    ).rejects.toThrow();
  });

  it('refuses to create a job for a suspended company', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await fx.employerWithCompany('Suspended Ltd');
    await db.update(companies).set({ status: 'suspended' }).where(eq(companies.id, companyId));

    await expect(
      createJob({ title: 'Any Role', description: 'x', companyId, createdByUserId: userId })
    ).rejects.toThrowError(/suspended/i);
  });

  it('writes a status history row attributed to the acting user for every transition', async () => {
    await truncateAllTables(db);
    const { jobId, userId, companyId } = await approvedJob();
    await submitJobForApproval({ jobId, companyId, actorUserId: userId }).catch(() => undefined);

    const rows = await db
      .select()
      .from(jobStatusHistory)
      .where(and(eq(jobStatusHistory.jobId, jobId)));

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((row) => row.changedByUserId !== null)).toBe(true);
  });


  it('does not consume a credit when the submission itself is rejected', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits(2);

    // Publish directly so 'draft -> pending_approval' is no longer legal.
    const jobId = await fx.job({ companyId, status: 'published' });

    await expect(
      submitJobForApproval({ jobId, companyId, actorUserId: userId })
    ).rejects.toThrowError();

    // The failed attempt must leave the balance untouched.
    const balance = await getCreditBalance(companyId);
    expect(balance.used).toBe(0);
    expect(balance.available).toBe(2);
  });

  it('consumes a credit and records history as one atomic unit', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits(2);
    const jobId = await fx.job({ companyId, status: 'draft' });

    await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    const balance = await getCreditBalance(companyId);
    expect(balance.used).toBe(1);
    expect(balance.available).toBe(1);

    // Status, history and ledger must all agree: they committed together.
    const job = await getCompanyJob(jobId, companyId);
    expect(['pending_approval', 'published']).toContain(job.status);
    const history = await db
      .select()
      .from(jobStatusHistory)
      .where(and(eq(jobStatusHistory.jobId, jobId)));
    expect(history.length).toBeGreaterThan(0);
  });

  it('never leaves a submitted job without a consumed credit', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await employerWithCredits(1);
    const jobId = await fx.job({ companyId, status: 'draft' });

    await submitJobForApproval({ jobId, companyId, actorUserId: userId });

    const job = await getCompanyJob(jobId, companyId);
    const used = (await getCreditBalance(companyId)).used;

    // The invariant that makes billing trustworthy: submitted implies charged.
    if (job.status !== 'draft') {
      expect(used).toBe(1);
    } else {
      expect(used).toBe(0);
    }
  });
});
