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
  ensureCandidateProfile,
  refreshProfileCompletion,
  sanitizeUrl,
  updateCandidateProfile,
} from '@/lib/portal/candidates/profile';
import {
  addEducation,
  addExperience,
  listEducation,
  listExperience,
  listSkills,
  removeEducation,
  removeSkill,
  updatePreferences,
  upsertSkill,
} from '@/lib/portal/candidates/details';
import {
  createJobAlert,
  deleteJobAlert,
  listJobAlerts,
  listSavedJobIds,
  listSavedJobs,
  matchJobsForAlert,
  saveJob,
  unsaveJob,
} from '@/lib/portal/candidates/saved-jobs';
import { candidatePreferences } from '@/lib/db/portal-schema';

describe('candidate profile (real database)', () => {
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

  it('creates a profile and preferences on first use, and is idempotent', async () => {
    await truncateAllTables(db);
    const userId = await fx.user('candidate');

    const first = await ensureCandidateProfile({ userId, fullName: 'New Person' });
    const second = await ensureCandidateProfile({ userId, fullName: 'Ignored' });
    // Calling twice must not create a second profile.
    expect(second.id).toBe(first.id);

    const preferences = await db.select().from(candidatePreferences);
    expect(preferences).toHaveLength(1);
  });

  it('updates editable fields and recomputes completion server-side', async () => {
    await truncateAllTables(db);
    const userId = await fx.user('candidate');
    const profile = await ensureCandidateProfile({ userId, fullName: 'Jane' });

    const updated = await updateCandidateProfile(profile.id, {
      headline: 'Backend engineer',
      location: 'Bengaluru',
      totalExperienceYears: 5,
    });
    expect(updated.headline).toBe('Backend engineer');
    expect(updated.totalExperienceYears).toBe(5);

    // Completion is derived, not client-supplied.
    const completion = await refreshProfileCompletion(profile.id);
    expect(completion.percentage).toBeGreaterThan(0);
    expect(completion.missing).toContain('skills'); // no skills yet
  });

  it('rejects a non-http URL so a profile cannot hold a javascript: link', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html,<script>')).toBeNull();
    expect(sanitizeUrl('not a url')).toBeNull();
  });

  it('stores profile details only for the owning candidate', async () => {
    await truncateAllTables(db);
    const a = await fx.candidate('Alice');
    const b = await fx.candidate('Bob');

    await upsertSkill(a, { name: 'React' });
    expect(await listSkills(a)).toHaveLength(1);
    // Bob has his own, separate skills.
    expect(await listSkills(b)).toHaveLength(0);

    // A foreign id is simply not found.
    const [skill] = await listSkills(a);
    expect(await removeSkill(b, skill.id)).toBe(false);
    expect(await removeSkill(a, skill.id)).toBe(true);
  });

  it('normalises skill names to lowercase and de-duplicates', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();

    await upsertSkill(candidateId, { name: 'React' });
    await upsertSkill(candidateId, { name: 'react' }); // same skill, different case
    await upsertSkill(candidateId, { name: 'Node' });

    const skills = await listSkills(candidateId);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(['node', 'react']);
  });

  it('records education and experience as real rows', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();

    await addEducation(candidateId, { institution: 'IIT Madras', degree: 'B.Tech' });
    await addExperience(candidateId, {
      company: 'Acme',
      title: 'Engineer',
      isCurrent: true,
    });

    expect(await listEducation(candidateId)).toHaveLength(1);
    const experience = await listExperience(candidateId);
    expect(experience).toHaveLength(1);
    // A current role has no end date.
    expect(experience[0].endDate).toBeNull();
  });

  it('scopes sub-resource deletion to the owner', async () => {
    await truncateAllTables(db);
    const owner = await fx.candidate('Owner');
    const other = await fx.candidate('Other');
    const education = await addEducation(owner, { institution: 'Somewhere' });

    expect(await removeEducation(other, education.id)).toBe(false);
    expect(await removeEducation(owner, education.id)).toBe(true);
  });

  it('stores job preferences as normalised lists', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();

    const preferences = await updatePreferences(candidateId, {
      preferredLocations: ['Bengaluru', '  Pune  '],
      preferredWorkModes: ['Remote', 'remote'],
      minSalaryMinor: 1500000,
    });

    expect(preferences.preferredLocations).toEqual(['bengaluru', 'pune']);
    expect(preferences.preferredWorkModes).toEqual(['remote']);
    expect(preferences.minSalaryMinor).toBe(1500000);
  });
});

describe('saved jobs and alerts (real database)', () => {
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

  it('saves a job idempotently and unsaves it', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const jobId = await fx.job({ status: 'published' });

    expect(await saveJob(candidateId, jobId)).toBe(true);
    // Saving again is a no-op, not a duplicate and not an error.
    expect(await saveJob(candidateId, jobId)).toBe(false);
    expect(await listSavedJobs(candidateId)).toHaveLength(1);
    expect(await listSavedJobIds(candidateId)).toEqual([jobId]);

    expect(await unsaveJob(candidateId, jobId)).toBe(true);
    expect(await listSavedJobs(candidateId)).toHaveLength(0);
  });

  it('refuses to save a job that is not publicly visible', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const draft = await fx.job({ status: 'draft' });

    await expect(saveJob(candidateId, draft)).rejects.toThrowError(/not found/i);
  });

  it('keeps saved jobs private to their owner', async () => {
    await truncateAllTables(db);
    const alice = await fx.candidate('Alice');
    const bob = await fx.candidate('Bob');
    const jobId = await fx.job({ status: 'published' });

    await saveJob(alice, jobId);
    expect(await listSavedJobs(alice)).toHaveLength(1);
    expect(await listSavedJobs(bob)).toHaveLength(0);
  });

  it('creates and deletes an alert', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();

    const alert = await createJobAlert(candidateId, {
      name: 'React roles in Bengaluru',
      keywords: 'react',
      location: 'Bengaluru',
      skills: ['React'],
      frequency: 'daily',
    });

    expect(alert.frequency).toBe('daily');
    // Skills are normalised like everywhere else.
    expect(alert.skills).toEqual(['react']);
    expect(await listJobAlerts(candidateId)).toHaveLength(1);

    expect(await deleteJobAlert(candidateId, alert.id)).toBe(true);
    expect(await listJobAlerts(candidateId)).toHaveLength(0);
  });

  it('matches jobs for an alert with a real database query', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const { companyId } = await fx.employerWithCompany('Alert Co');

    await fx.job({
      companyId,
      status: 'published',
      title: 'React Developer',
      location: 'Bengaluru',
      skills: ['react'],
    });
    await fx.job({
      companyId,
      status: 'published',
      title: 'Backend Engineer',
      location: 'Pune',
      skills: ['node'],
    });
    // A draft must never match.
    await fx.job({ companyId, status: 'draft', title: 'React Intern', skills: ['react'] });

    const alert = await createJobAlert(candidateId, {
      name: 'React in Bengaluru',
      skills: ['react'],
      location: 'Bengaluru',
    });

    const matches = await matchJobsForAlert(alert);
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe('React Developer');
  });

  it('will not let one candidate delete another candidate alert', async () => {
    await truncateAllTables(db);
    const alice = await fx.candidate('Alice');
    const bob = await fx.candidate('Bob');
    const alert = await createJobAlert(alice, { name: 'Mine' });

    expect(await deleteJobAlert(bob, alert.id)).toBe(false);
    expect(await listJobAlerts(alice)).toHaveLength(1);
  });
});

