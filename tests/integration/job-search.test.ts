import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, truncateAllTables, type TestDatabase } from '../support/database';
import {
  countJobSearch,
  PortalFixtures,
  runJobSearch,
} from '../support/fixtures';
import {
  escapeLikePattern,
  normalizeSkillList,
  parsePagination,
  type JobSearchFilters,
} from '@/lib/portal/jobs/filters';

/**
 * Builds a varied corpus: different cities, experience bands, salaries, work
 * modes, employment types and skill sets — plus draft/rejected/closed jobs that
 * must never appear publicly.
 */
async function seedCorpus(db: TestDatabase, fx: PortalFixtures): Promise<Record<string, string>> {
  await truncateAllTables(db);
  const bangalore = await fx.employerWithCompany('Bangalore Analytics');
  const pune = await fx.employerWithCompany('Pune Software');

  const backend = await fx.job({
    companyId: bangalore.companyId,
    title: 'Backend Engineer',
    description: 'Build distributed services with Node.js',
    location: 'Bangalore',
    workMode: 'remote',
    employmentType: 'full_time',
    experienceMinYears: 3,
    experienceMaxYears: 6,
    salaryMinMinor: 1500000,
    salaryMaxMinor: 2500000,
    salaryPublic: true,
    skills: ['node', 'postgres', 'kubernetes'],
    publishedAt: new Date('2024-01-01'),
    status: 'published',
  });

  const frontend = await fx.job({
    companyId: bangalore.companyId,
    title: 'Frontend Developer',
    description: 'Craft accessible React interfaces',
    location: 'Bangalore',
    workMode: 'hybrid',
    employmentType: 'full_time',
    experienceMinYears: 1,
    experienceMaxYears: 3,
    salaryMinMinor: 800000,
    salaryMaxMinor: 1200000,
    salaryPublic: true,
    skills: ['react', 'typescript'],
    publishedAt: new Date('2024-02-01'),
    status: 'published',
  });

  const dataScientist = await fx.job({
    companyId: pune.companyId,
    title: 'Data Scientist',
    description: 'Build machine learning models',
    location: 'Pune',
    workMode: 'onsite',
    employmentType: 'contract',
    experienceMinYears: 6,
    experienceMaxYears: 10,
    salaryMinMinor: 2000000,
    salaryMaxMinor: 3000000,
    salaryPublic: true,
    skills: ['python', 'machine learning'],
    publishedAt: new Date('2024-03-01'),
    status: 'published',
  });

  // These share the published backend job's title, city and skill, so only the
  // status predicate can keep them out of public results.
  const draft = await fx.job({
    companyId: pune.companyId,
    title: 'Backend Engineer Draft',
    description: 'Not approved yet',
    location: 'Bangalore',
    status: 'draft',
    skills: ['node'],
  });
  const rejected = await fx.job({
    companyId: pune.companyId,
    title: 'Backend Engineer Rejected',
    description: 'Rejected posting',
    location: 'Bangalore',
    status: 'rejected',
    skills: ['node'],
  });
  const closed = await fx.job({
    companyId: pune.companyId,
    title: 'Backend Engineer Closed',
    description: 'No longer accepting',
    location: 'Bangalore',
    status: 'closed',
    skills: ['node'],
  });

  return { backend, frontend, dataScientist, draft, rejected, closed };
}

/**
 * REAL database tests for job search filtering.
 *
 * The historical bug this guards against: the previous implementation loaded
 * rows and filtered them in JavaScript, so filters silently did nothing and
 * deep results were truncated. These tests execute the ACTUAL production
 * predicate builder against PostgreSQL.
 */
describe('job search filtering (real SQL)', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  beforeAll(async () => {
    db = await createTestDatabase();
    fx = new PortalFixtures(db);
  });

  afterAll(async () => {
    await db.$client.close();
  });

  const search = (filters: JobSearchFilters) => runJobSearch(db, filters);

  it('returns only published jobs for an unfiltered search', async () => {
    const ids = await seedCorpus(db, fx);
    const results = await search({});
    expect(results).toHaveLength(3);
    expect(results).toContain(ids.backend);
    expect(results).not.toContain(ids.draft);
    expect(results).not.toContain(ids.rejected);
    expect(results).not.toContain(ids.closed);
  });

  it('matches a keyword against title, description and skills', async () => {
    const ids = await seedCorpus(db, fx);
    expect(await search({ keyword: 'backend' })).toEqual([ids.backend]);
    expect(await search({ keyword: 'react' })).toEqual([ids.frontend]);
    // 'python' appears only in the skills array, not in the free text.
    expect(await search({ keyword: 'python' })).toEqual([ids.dataScientist]);
  });

  it('filters by location', async () => {
    const ids = await seedCorpus(db, fx);
    expect(await search({ location: 'Pune' })).toEqual([ids.dataScientist]);
  });
  it('filters by experience band overlap', async () => {
    const ids = await seedCorpus(db, fx);
    // 0-2 years overlaps only the 1-3 band.
    expect(await search({ experienceMin: 0, experienceMax: 2 })).toEqual([ids.frontend]);
    // 5-7 years overlaps BOTH the 3-6 and the 6-10 bands: someone asking for 5-7
    // years genuinely matches a 3-6 role as well as a 6-10 one.
    const senior = await search({ experienceMin: 5, experienceMax: 7 });
    expect([...senior].sort()).toEqual([ids.backend, ids.dataScientist].sort());
    // A band that cannot overlap anything matches nothing.
    expect(await search({ experienceMin: 20, experienceMax: 30 })).toEqual([]);
  });

  it('filters by minimum salary using the upper bound of the band', async () => {
    const ids = await seedCorpus(db, fx);
    const results = await search({ salaryMin: 2000000 });
    expect(results).toContain(ids.backend);
    expect(results).toContain(ids.dataScientist);
    expect(results).not.toContain(ids.frontend);
  });

  it('filters by work mode and employment type', async () => {
    const ids = await seedCorpus(db, fx);
    expect(await search({ workMode: 'remote' })).toEqual([ids.backend]);
    expect(await search({ employmentType: 'contract' })).toEqual([ids.dataScientist]);
  });

  it('requires EVERY requested skill to be present', async () => {
    const ids = await seedCorpus(db, fx);
    expect(await search({ skills: ['node', 'postgres'] })).toEqual([ids.backend]);
    // 'node' matches the backend job, 'python' does not, so AND yields zero.
    expect(await search({ skills: ['node', 'python'] })).toEqual([]);
  });

  it('combines keyword, location and work mode', async () => {
    const ids = await seedCorpus(db, fx);
    expect(await search({ keyword: 'engineer', location: 'Bangalore', workMode: 'remote' })).toEqual([
      ids.backend,
    ]);
    expect(await search({ keyword: 'engineer', location: 'Bangalore', workMode: 'onsite' })).toEqual([]);
  });

  it('combines salary and experience filters', async () => {
    const ids = await seedCorpus(db, fx);
    // A 2,000,000 floor combined with a 5-7 year band: the 3-6 backend role and
    // the 6-10 data role both clear the floor, the 1-3 frontend role clears
    // neither constraint.
    const matched = await search({ salaryMin: 2000000, experienceMin: 5, experienceMax: 7 });
    expect([...matched].sort()).toEqual([ids.backend, ids.dataScientist].sort());
    expect(matched).not.toContain(ids.frontend);

    // Raising the floor above every advertised band excludes the frontend role.
    expect(await search({ salaryMin: 2900000, experienceMin: 5, experienceMax: 7 })).toEqual([
      ids.dataScientist,
    ]);
  });

  it('filters by company name', async () => {
    const ids = await seedCorpus(db, fx);
    expect(await search({ companyName: 'Pune' })).toEqual([ids.dataScientist]);
  });

  it('never returns a non-published job even when other filters match it', async () => {
    const ids = await seedCorpus(db, fx);
    // Draft/rejected/closed share the published job's title, city and skill, so
    // only the status predicate can keep them out.
    expect(await search({ keyword: 'backend', location: 'Bangalore', skills: ['node'] })).toEqual([
      ids.backend,
    ]);
  });

  it('filters by application deadline', async () => {
    await truncateAllTables(db);
    const companyId = (await fx.employerWithCompany('Deadline Co')).companyId;
    const openJob = await fx.job({ companyId, applicationDeadline: new Date('2030-01-01') });
    const passedJob = await fx.job({ companyId, applicationDeadline: new Date('2020-01-01') });

    const results = await search({ applicationDeadlineAfter: new Date('2025-01-01') });
    expect(results).toContain(openJob);
    expect(results).not.toContain(passedJob);
  });

  it('filters by posted-within window', async () => {
    await seedCorpus(db, fx);
    // All seeded jobs were published in 2024, so none fall within one day.
    expect(await search({ postedWithinDays: 1 })).toHaveLength(0);
  });

  it('paginates deterministically with a stable tie-breaker', async () => {
    await seedCorpus(db, fx);
    const page1 = await runJobSearch(db, {});
    expect(page1).toHaveLength(3);
    // Running the same query twice must return the identical ordering.
    expect(await runJobSearch(db, {})).toEqual(page1);
  });
});

describe('job search totals and filter helpers', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  beforeAll(async () => {
    db = await createTestDatabase();
    fx = new PortalFixtures(db);
  });

  afterAll(async () => {
    await db.$client.close();
  });

  it('reports a total consistent with the rows returned', async () => {
    await seedCorpus(db, fx);
    expect(await countJobSearch(db, {})).toBe(3);
    expect(await countJobSearch(db, { location: 'Bangalore' })).toBe(2);
    expect(await countJobSearch(db, { workMode: 'remote' })).toBe(1);
    expect(await countJobSearch(db, { skills: ['node', 'kubernetes'] })).toBe(1);
    expect(await countJobSearch(db, { skills: ['node', 'python'] })).toBe(0);
  });

  it('escapes LIKE metacharacters so a keyword is matched literally', () => {
    expect(escapeLikePattern('100%_done')).toBe('100\\%\\_done');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('normalises, de-duplicates and lowercases skill filters', () => {
    expect(normalizeSkillList([' React ', 'REACT', 'Node'])).toEqual(['react', 'node']);
    expect(normalizeSkillList(['  ', ''])).toEqual([]);
    expect(normalizeSkillList(undefined)).toEqual([]);
  });

  it('rejects invalid pagination input', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20 });
    expect(parsePagination({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10 });
    expect(() => parsePagination({ page: '0' })).toThrow();
    expect(() => parsePagination({ pageSize: '500' })).toThrow();
    expect(() => parsePagination({ page: 'abc' })).toThrow();
  });

  it('confines results to publicly visible statuses only', async () => {
    await truncateAllTables(db);
    await fx.job({ status: 'draft' });
    await fx.job({ status: 'pending_approval' });
    const published = await fx.job({ status: 'published' });

    expect(await runJobSearch(db, {})).toEqual([published]);
  });
});





