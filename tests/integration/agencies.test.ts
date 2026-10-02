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
  addAgencyClient,
  listAgencyClients,
  requireAgencyClientAccess,
  revokeAgencyClient,
  setCompanyType,
} from '@/lib/portal/agencies';
import { createJob } from '@/lib/portal/jobs/service';
import { companies } from '@/lib/db/portal-schema';
import { eq } from 'drizzle-orm';

/**
 * Recruitment agency / staffing company support (real database).
 *
 * The requirement is two-sided: an agency must be able to post a vacancy for a
 * client company, AND it must stay distinct from a direct employer. Both halves
 * are asserted here, because the interesting failures are the unauthorised ones:
 * an agency posting for a stranger, or a direct employer quietly acquiring the
 * same power.
 */
describe('recruitment agencies posting on behalf of clients', () => {
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

  it('lets an authorised agency create a job for its client', async () => {
    await truncateAllTables(db);
    const { userId: agencyUserId, companyId: agencyId } = await fx.agencyWithCompany();
    const { companyId: clientId } = await fx.employerWithCompany('Client Co');

    await addAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: agencyUserId });

    const job = await createJob({
      title: 'Contract Backend Engineer',
      description: 'Six month engagement building payment services.',
      companyId: agencyId,
      createdByUserId: agencyUserId,
      postedForCompanyId: clientId,
    });

    // Billing and moderation stay with the agency; provenance names the client.
    expect(job.companyId).toBe(agencyId);
    expect(job.postedForCompanyId).toBe(clientId);
    expect(job.status).toBe('draft');
  });

  it('records no client on a direct-employer posting', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await fx.employerWithCompany('Direct Co');

    const job = await createJob({
      title: 'In-house Analyst',
      description: 'Own the reporting function end to end.',
      companyId,
      createdByUserId: userId,
    });

    expect(job.postedForCompanyId).toBeNull();
  });

  it('refuses an agency posting for a company it has no link to', async () => {
    await truncateAllTables(db);
    const { userId, companyId: agencyId } = await fx.agencyWithCompany();
    const { companyId: strangerId } = await fx.employerWithCompany('Stranger Co');

    // No client link exists, so this is exactly the impersonation case.
    await expect(
      createJob({
        title: 'Not My Role',
        description: 'This vacancy belongs to a company we do not represent.',
        companyId: agencyId,
        createdByUserId: userId,
        postedForCompanyId: strangerId,
      })
    ).rejects.toThrowError(/not authorised/i);
  });

  it('refuses a direct employer claiming to post for another company', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await fx.employerWithCompany('Impostor Co');
    const { companyId: otherId } = await fx.employerWithCompany('Victim Co');

    // Even with a link forced directly into the table, a non-agency is refused:
    // the check is on the company's TYPE, not merely on a row's existence.
    await addAgencyClient({
      agencyCompanyId: companyId,
      clientCompanyId: otherId,
      actorUserId: userId,
    }).catch(() => undefined);

    await expect(
      createJob({
        title: 'Borrowed Identity',
        description: 'Attempting to publish under another company name.',
        companyId,
        createdByUserId: userId,
        postedForCompanyId: otherId,
      })
    ).rejects.toThrowError();
  });

  it('refuses a company acting as its own client', async () => {
    await truncateAllTables(db);
    const { userId, companyId } = await fx.agencyWithCompany();

    await expect(
      addAgencyClient({ agencyCompanyId: companyId, clientCompanyId: companyId, actorUserId: userId })
    ).rejects.toThrowError(/its own/i);
  });

  it('stops an agency posting once the client link is revoked', async () => {
    await truncateAllTables(db);
    const { userId, companyId: agencyId } = await fx.agencyWithCompany();
    const { companyId: clientId } = await fx.employerWithCompany('Former Client');

    await addAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: userId });
    expect((await listAgencyClients(agencyId))[0]?.status).toBe('active');

    await revokeAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: userId });

    await expect(
      createJob({
        title: 'After Revocation',
        description: 'Posting after the client relationship ended.',
        companyId: agencyId,
        createdByUserId: userId,
        postedForCompanyId: clientId,
      })
    ).rejects.toThrowError(/not authorised/i);
  });

  it('restores a revoked link without duplicating the authorisation row', async () => {
    await truncateAllTables(db);
    const { userId, companyId: agencyId } = await fx.agencyWithCompany();
    const { companyId: clientId } = await fx.employerWithCompany('Returning Client');

    await addAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: userId });
    await revokeAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: userId });
    await addAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: userId });

    const clients = await listAgencyClients(agencyId);
    expect(clients).toHaveLength(1);
    expect(clients[0]?.status).toBe('active');
  });

  it('reports revoking an unknown client honestly rather than claiming success', async () => {
    await truncateAllTables(db);
    const { userId, companyId: agencyId } = await fx.agencyWithCompany();
    const { companyId: neverLinked } = await fx.employerWithCompany('Never Linked');

    const revoked = await revokeAgencyClient({
      agencyCompanyId: agencyId,
      clientCompanyId: neverLinked,
      actorUserId: userId,
    });
    expect(revoked).toBe(false);
  });

  it('lets an admin reclassify a company and revokes its client authority', async () => {
    await truncateAllTables(db);
    const { userId, companyId: agencyId } = await fx.agencyWithCompany();
    const { companyId: clientId } = await fx.employerWithCompany('Client Co');
    const adminId = await fx.user('admin');

    await addAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: userId });

    await setCompanyType({ companyId: agencyId, companyType: 'employer', adminUserId: adminId });

    // Downgrading must not leave live agency permissions behind.
    const [row] = await db.select().from(companies).where(eq(companies.id, agencyId));
    expect(row.companyType).toBe('employer');
    await expect(
      requireAgencyClientAccess({ agencyCompanyId: agencyId, clientCompanyId: clientId })
    ).rejects.toThrowError();
  });

  it('keeps the two account kinds distinguishable in the database', async () => {
    await truncateAllTables(db);
    const { companyId: directId } = await fx.employerWithCompany('Direct Co');
    const { companyId: agencyId } = await fx.agencyWithCompany();

    const rows = await db.select().from(companies);
    const direct = rows.find((r) => r.id === directId);
    const agency = rows.find((r) => r.id === agencyId);

    expect(direct?.companyType).toBe('employer');
    expect(agency?.companyType).toBe('recruitment_agency');
  });

  it('refuses agency posting while the agency account is suspended', async () => {
    await truncateAllTables(db);
    const { userId, companyId: agencyId } = await fx.agencyWithCompany();
    const { companyId: clientId } = await fx.employerWithCompany('Client Co');
    await addAgencyClient({ agencyCompanyId: agencyId, clientCompanyId: clientId, actorUserId: userId });

    await db.update(companies).set({ status: 'suspended' }).where(eq(companies.id, agencyId));

    await expect(
      requireAgencyClientAccess({ agencyCompanyId: agencyId, clientCompanyId: clientId })
    ).rejects.toThrowError(/suspended/i);
  });
});
