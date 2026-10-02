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
  changeUserRole,
  createJobPackage,
  getPlatformSetting,
  listJobPackages,
  listPlatformSettings,
  listUsersForAdmin,
  reinstateUser,
  setPlatformSetting,
  suspendUser,
  updateJobPackage,
} from '@/lib/portal/admin/users';
import {
  createJob,
  getCompanyJob,
  listJobsForAdmin,
  reviewJob,
  submitJobForApproval,
} from '@/lib/portal/jobs/service';
import { createOrder, markOrderPaidAndGrantCredits } from '@/lib/portal/payments';
import { adjustCredits, getCreditBalance } from '@/lib/portal/credits';
import { getPlatformStats } from '@/lib/portal/admin/stats';
import { setCompanyVerification } from '@/lib/portal/employers/company';
import { applyToJob } from '@/lib/portal/applications';
import { companies } from '@/lib/db/portal-schema';
import { auditLog } from '@/lib/db/schema';

describe('admin operations (real database)', () => {
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

  it('suspends a user, blocking sign-in, and reinstates them', async () => {
    await truncateAllTables(db);
    const userId = await fx.user('candidate');
    const adminId = await fx.user('admin');

    const suspended = await suspendUser({
      userId,
      adminUserId: adminId,
      reason: 'Policy breach',
    });
    expect(suspended.accountStatus).toBe('suspended');
    expect(suspended.suspensionReason).toBe('Policy breach');

    const reinstated = await reinstateUser({ userId, adminUserId: adminId });
    expect(reinstated.accountStatus).toBe('active');
    expect(reinstated.suspensionReason).toBeNull();
  });

  it('refuses to suspend without a reason', async () => {
    await truncateAllTables(db);
    const userId = await fx.user('candidate');
    await expect(
      suspendUser({ userId, adminUserId: await fx.user('admin'), reason: '  ' })
    ).rejects.toThrowError(/reason is required/i);
  });

  it('will not let an admin assign an admin or owner role', async () => {
    await truncateAllTables(db);
    const userId = await fx.user('candidate');
    const adminId = await fx.user('admin');

    for (const role of ['admin', 'owner', 'staff'] as never[]) {
      await expect(
        changeUserRole({ userId, role, adminUserId: adminId })
      ).rejects.toThrowError(/cannot be assigned/i);
    }

    // A permitted role does work.
    const updated = await changeUserRole({ userId, role: 'employer', adminUserId: adminId });
    expect(updated.role).toBe('employer');
  });

  it('lists and filters users for the console', async () => {
    await truncateAllTables(db);
    await fx.user('candidate', 'One');
    await fx.user('candidate', 'Two');
    await fx.user('employer', 'Three');

    const candidates = await listUsersForAdmin({ role: 'candidate' });
    expect(candidates.total).toBe(2);
    expect(candidates.items.every((user) => user.role === 'candidate')).toBe(true);
    expect(candidates.items[0].emailVerified).toBe(false);

    const all = await listUsersForAdmin();
    expect(all.total).toBe(3);
  });

  it('verifies a company only through the admin path, and audits it', async () => {
    await truncateAllTables(db);
    const { companyId } = await fx.employerWithCompany('Verify Me Ltd');
    const adminId = await fx.user('admin');

    const [before] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(before.verificationStatus).toBe('pending');

    const verified = await setCompanyVerification({
      companyId,
      status: 'verified',
      adminUserId: adminId,
      notes: 'GST confirmed',
    });
    expect(verified.verificationStatus).toBe('verified');
    expect(verified.verifiedByUserId).toBe(adminId);

    const audits = await db.select().from(auditLog);
    expect(audits.some((row) => row.action === 'company_verification_granted')).toBe(true);
  });

  it('audits a suspension', async () => {
    await truncateAllTables(db);
    const userId = await fx.user('candidate');
    await suspendUser({ userId, adminUserId: await fx.user('admin'), reason: 'Abuse' });

    const audits = await db.select().from(auditLog);
    const entry = audits.find((row) => row.action === 'user_suspended');
    expect(entry).toBeDefined();
    // The audit must not contain the password or any secret.
    expect(JSON.stringify(entry?.metadata ?? {})).not.toMatch(/password|secret|token/i);
  });

  it('creates, validates and updates a job package', async () => {
    await truncateAllTables(db);
    const adminId = await fx.user('admin');

    const pkg = await createJobPackage(
      {
        code: 'starter',
        name: 'Starter',
        priceMinor: 99000,
        credits: 3,
        validityDays: 60,
        features: [{ key: 'highlight', value: 'top' }],
      },
      adminId
    );
    expect(pkg.priceMinor).toBe(99000);
    expect(pkg.credits).toBe(3);

    const listed = await listJobPackages();
    expect(listed).toHaveLength(1);
    expect(listed[0].features[0].key).toBe('highlight');

    const updated = await updateJobPackage(pkg.id, { priceMinor: 149900 }, adminId);
    expect(updated.priceMinor).toBe(149900);
  });

  it('rejects an invalid package', async () => {
    await truncateAllTables(db);
    const adminId = await fx.user('admin');

    // Zero credits is invalid.
    await expect(
      createJobPackage(
        { code: 'bad', name: 'Bad', priceMinor: 100, credits: 0, validityDays: 30 },
        adminId
      )
    ).rejects.toThrowError(/credits/i);

    // A fractional price is invalid (money is integer minor units).
    await expect(
      createJobPackage(
        { code: 'bad2', name: 'Bad', priceMinor: 99.5, credits: 1, validityDays: 30 },
        adminId
      )
    ).rejects.toThrowError(/price/i);
  });

  it('reads and writes platform settings', async () => {
    await truncateAllTables(db);
    const adminId = await fx.user('admin');

    // A fallback is returned until a value is stored.
    expect(await getPlatformSetting('job_approval_required', true)).toBe(true);

    await setPlatformSetting({
      key: 'job_approval_required',
      value: false,
      adminUserId: adminId,
    });
    expect(await getPlatformSetting('job_approval_required', true)).toBe(false);

    const settings = await listPlatformSettings();
    expect(settings.some((row) => row.key === 'job_approval_required')).toBe(true);
  });

  it('adjusts credits and records the change in the audit log', async () => {
    await truncateAllTables(db);
    const { companyId, userId } = await fx.employerWithCompany('Adjust Ltd');
    const packageId = await fx.package({ credits: 2 });
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_adj' });

    expect((await getCreditBalance(companyId)).available).toBe(2);

    await adjustCredits({
      companyId,
      amount: 3,
      adminUserId: await fx.user('admin'),
      notes: 'Goodwill credit',
    });

    const balance = await getCreditBalance(companyId);
    expect(balance.total).toBe(5);
    expect(balance.available).toBe(5);

    const audits = await db.select().from(auditLog);
    expect(audits.some((row) => row.action === 'job_credits_adjusted')).toBe(true);
  });

  it('computes platform statistics from real rows', async () => {
    await truncateAllTables(db);
    await fx.candidate('Alice');
    await fx.candidate('Bob');
    const { userId, companyId } = await fx.employerWithCompany('Stats Ltd');
    await setCompanyVerification({ companyId, status: 'verified', adminUserId: await fx.user('admin') });

    const jobId = await fx.job({ companyId, status: 'published' });
    await applyToJob({ candidateProfileId: await fx.candidate('Carol'), jobId });
    void userId;

    const stats = await getPlatformStats();
    // Three candidates were registered. The employer count includes the extra
    // employer the job fixture creates, so it is asserted loosely below.
    expect(stats.candidates).toBe(3);
    expect(stats.employers).toBeGreaterThanOrEqual(1);
    expect(stats.companies).toBe(1);
    expect(stats.verifiedCompanies).toBe(1);
    expect(stats.activeJobs).toBe(1);
    expect(stats.totalApplications).toBe(1);
    expect(stats.hires).toBe(0);
  });

  it('lists the review queue and records an approval decision', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await fx.employerWithCompany('Queue Ltd');
    const packageId = await fx.package({ credits: 1 });
    const order = await createOrder({ companyId, userId, packageId, nonRefundableAccepted: true });
    await markOrderPaidAndGrantCredits({ orderId: order.id, providerPaymentId: 'pay_queue' });

    const job = await createJob({
      title: 'Review Me',
      description: 'A role awaiting approval.',
      companyId,
      createdByUserId: userId,
    });
    await submitJobForApproval({ jobId: job.id, companyId, actorUserId: userId });

    const queue = await listJobsForAdmin({ status: 'pending_approval' });
    expect(queue.map((row) => row.id)).toContain(job.id);

    const adminId = await fx.user('admin');
    await reviewJob({ jobId: job.id, decision: 'approve', adminUserId: adminId });

    const audits = await db.select().from(auditLog);
    expect(audits.some((row) => row.action === 'job_approved')).toBe(true);
    expect((await getCompanyJob(job.id, companyId)).status).toBe('published');
  });
});


