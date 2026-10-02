import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures } from '../support/fixtures';
import {
  consentSummary,
  hasConsent,
  listConsents,
  recordConsent,
  requireConsent,
  withdrawConsent,
} from '@/lib/portal/consents';
import { createReport, listReportsByReporter, listReportsForAdmin, resolveReport } from '@/lib/portal/reports';
import { sanitizeAuditMetadata, PORTAL_AUDIT_ACTIONS } from '@/lib/portal/audit';
import { userConsents } from '@/lib/db/portal-schema';

describe('consent records (real database)', () => {
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

  async function userId(): Promise<string> {
    return fx.user('candidate');
  }

  it('records consent per purpose', async () => {
    await truncateAllTables(db);
    const id = await userId();

    await recordConsent({ userId: id, purpose: 'account_creation', policyVersion: 'v1' });
    await recordConsent({ userId: id, purpose: 'job_application', policyVersion: 'v1' });

    expect(await hasConsent(id, 'account_creation')).toBe(true);
    expect(await hasConsent(id, 'job_application')).toBe(true);
    expect(await hasConsent(id, 'marketing')).toBe(false);
  });

  it('withdrawing one purpose leaves the others granted', async () => {
    await truncateAllTables(db);
    const id = await userId();
    await recordConsent({ userId: id, purpose: 'job_application', policyVersion: 'v1' });
    await recordConsent({ userId: id, purpose: 'marketing', policyVersion: 'v1' });

    expect(await withdrawConsent(id, 'marketing')).toBe(true);

    // Crucially, withdrawing marketing must NOT revoke job_application.
    expect(await hasConsent(id, 'marketing')).toBe(false);
    expect(await hasConsent(id, 'job_application')).toBe(true);
  });

  it('keeps the withdrawal on the row rather than deleting history', async () => {
    await truncateAllTables(db);
    const id = await userId();
    await recordConsent({ userId: id, purpose: 'recruitment_services', policyVersion: 'v1' });
    await withdrawConsent(id, 'recruitment_services');

    const rows = await db.select().from(userConsents);
    expect(rows).toHaveLength(1);
    expect(rows[0].withdrawnAt).not.toBeNull();

    const history = await listConsents(id);
    expect(history[0].granted).toBe(false);
  });

  it('re-accepting clears the withdrawal and updates the version', async () => {
    await truncateAllTables(db);
    const id = await userId();
    await recordConsent({ userId: id, purpose: 'marketing', policyVersion: 'v1' });
    await withdrawConsent(id, 'marketing');
    await recordConsent({ userId: id, purpose: 'marketing', policyVersion: 'v2' });

    expect(await hasConsent(id, 'marketing')).toBe(true);
    const history = await listConsents(id);
    expect(history).toHaveLength(1); // one live row per purpose
    expect(history[0].policyVersion).toBe('v2');
  });

  it('requireConsent blocks processing without consent', async () => {
    await truncateAllTables(db);
    const id = await userId();
    await expect(requireConsent(id, 'employer_sharing')).rejects.toThrowError(/consent is required/i);

    await recordConsent({ userId: id, purpose: 'employer_sharing', policyVersion: 'v1' });
    await expect(requireConsent(id, 'employer_sharing')).resolves.toBeUndefined();
  });

  it('summarises consent counts per purpose', async () => {
    await truncateAllTables(db);
    const id = await userId();
    await recordConsent({ userId: id, purpose: 'account_creation', policyVersion: 'v1' });
    await recordConsent({ userId: id, purpose: 'marketing', policyVersion: 'v1' });
    await withdrawConsent(id, 'marketing');

    const summary = await consentSummary();
    const byPurpose = new Map(summary.map((row) => [row.purpose, row]));
    expect(byPurpose.get('account_creation')?.granted).toBe(1);
    expect(byPurpose.get('marketing')?.withdrawn).toBe(1);
  });
});

describe('reports and moderation (real database)', () => {
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

  it('files a report and exposes it to the reporter and the admin queue', async () => {
    await truncateAllTables(db);
    const reporterId = await fx.user('candidate');

    const report = await createReport({
      reporterUserId: reporterId,
      targetType: 'job',
      targetId: 'job-123',
      reason: 'misleading_or_scam',
      description: 'Asks for money up front.',
    });
    expect(report.status).toBe('open');

    expect(await listReportsByReporter(reporterId)).toHaveLength(1);
    expect(await listReportsForAdmin({ status: 'open' })).toHaveLength(1);
  });

  it('rejects an unsupported reason or target', async () => {
    await truncateAllTables(db);
    await expect(
      createReport({
        reporterUserId: null,
        targetType: 'job',
        targetId: 'j1',
        reason: 'because' as never,
      })
    ).rejects.toThrowError(/unsupported report reason/i);
  });

  it('records an admin resolution with notes and resolver', async () => {
    await truncateAllTables(db);
    const report = await createReport({
      reporterUserId: await fx.user('candidate'),
      targetType: 'company',
      targetId: 'c1',
      reason: 'other',
    });
    const adminId = await fx.user('admin');

    const resolved = await resolveReport({
      reportId: report.id,
      status: 'resolved',
      adminUserId: adminId,
      resolution: 'Listing removed.',
      adminNotes: 'Confirmed scam.',
    });

    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toBe('Listing removed.');
    expect(resolved.resolvedByUserId).toBe(adminId);
    expect(resolved.resolvedAt).not.toBeNull();
  });
});

describe('audit metadata sanitisation', () => {
  it('strips anything that looks like a secret', () => {
    const cleaned = sanitizeAuditMetadata({
      jobId: 'j1',
      password: 'hunter2',
      tokenHash: 'abc',
      resetToken: 'xyz',
      cardNumber: '4111111111111111',
      apiKey: 'sk-live-123',
      webhookSecret: 'whsec_1',
      signature: 'sig',
    });

    // Only non-sensitive identifiers survive.
    expect(cleaned).toEqual({ jobId: 'j1' });
  });

  it('keeps useful context and bounds its size', () => {
    const cleaned = sanitizeAuditMetadata({
      from: 'pending_approval',
      to: 'published',
      count: 3,
      note: 'x'.repeat(1000),
    });
    expect(cleaned.from).toBe('pending_approval');
    expect(cleaned.count).toBe(3);
    expect(String(cleaned.note).length).toBeLessThanOrEqual(303);
  });

  it('covers the actions the admin console relies on', () => {
    for (const action of [
      'user_suspended',
      'company_verification_granted',
      'job_approved',
      'job_rejected',
      'payment_status_changed',
      'job_credits_consumed',
      'entitlement_revoked',
      'platform_setting_changed',
    ]) {
      expect(PORTAL_AUDIT_ACTIONS).toContain(action as never);
    }
  });
});
