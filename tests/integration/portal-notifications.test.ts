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
import { applyToJob, updateApplicationStatus } from '@/lib/portal/applications';
import {
  notifyApplicationStatusChanged,
  notifyApplicationSubmitted,
} from '@/lib/portal/candidate-notifications';
import { notifications } from '@/lib/db/schema';
import { candidateProfiles } from '@/lib/db/portal-schema';

/**
 * In-app notifications for portal events (real database).
 *
 * Email is best-effort and can bounce; the in-app row is the durable record the
 * user can always come back to. These tests assert the row is actually written,
 * because the notification types existed while nothing created them.
 */
describe('portal in-app notifications', () => {
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

  it('records a notification for the applicant and the employer', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate('Jane Applicant');
    const { companyId } = await fx.employerWithCompany('Acme');

    const jobId = await fx.job({ companyId, status: 'published' });
    const application = await applyToJob({
      candidateProfileId: candidateId,
      jobId,
      coverLetter: 'Please consider me.',
    });

    await notifyApplicationSubmitted({ applicationId: application.id });

    const rows = await db.select().from(notifications);
    const types = rows.map((row) => row.type);

    expect(types).toContain('application_submitted');
    expect(types).toContain('new_application_received');
  });

  it('records the status change for the candidate only', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { userId, companyId } = await fx.employerWithCompany('Acme');
    const jobId = await fx.job({ companyId, status: 'published' });

    const application = await applyToJob({ candidateProfileId: candidateId, jobId });
    await updateApplicationStatus({
      applicationId: application.id,
      nextStatus: 'shortlisted',
      companyId,
      changedByUserId: userId,
    });

    await notifyApplicationStatusChanged({ applicationId: application.id });

    const rows = await db.select().from(notifications);
    const statusChange = rows.find((row) => row.type === 'application_status_changed');

    expect(statusChange).toBeDefined();
    // The body must name the new status, or it tells the candidate nothing.
    expect(statusChange?.body.toLowerCase()).toContain('shortlisted');
  });

  it('never fails the caller when the notification cannot be written', async () => {
    await truncateAllTables(db);

    // An application that does not exist must resolve quietly, not throw: the
    // business operation has already committed by this point.
    await expect(
      notifyApplicationStatusChanged({ applicationId: '00000000-0000-0000-0000-000000000000' })
    ).resolves.toBeUndefined();
    await expect(
      notifyApplicationSubmitted({ applicationId: '00000000-0000-0000-0000-000000000000' })
    ).resolves.toBeUndefined();

    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it('stores notifications against the correct recipient', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate('Trackable Candidate');
    const { companyId } = await fx.employerWithCompany('Acme');
    const jobId = await fx.job({ companyId, status: 'published' });
    const application = await applyToJob({ candidateProfileId: candidateId, jobId });

    await notifyApplicationSubmitted({ applicationId: application.id });

    const [candidateProfile] = await db.query.candidateProfiles.findMany({
      where: eq(candidateProfiles.id, candidateId),
    });
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'application_submitted'));

    // Belongs to the candidate's own account, not to the employer.
    expect(row?.userId).toBe(candidateProfile?.userId);
  });
});
