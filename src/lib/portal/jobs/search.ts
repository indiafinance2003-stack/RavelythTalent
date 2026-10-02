import 'server-only';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { companies, jobs, PUBLIC_JOB_STATUSES } from '@/lib/db/portal-schema';
import { notFound } from '@/lib/portal/authz';
import { rowsFromExecute } from '@/lib/db/rows';
import {
  buildJobPredicates,
  DEFAULT_PAGE_SIZE,
  jobSortOrder,
  MAX_PAGE_SIZE,
  type JobSearchFilters,
  type JobSort,
} from './filters';

export {
  JOB_SORT_OPTIONS,
  parsePagination,
  type JobSearchFilters,
  type JobSort,
} from './filters';

export interface JobSearchResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface JobListRow {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  location: string | null;
  workMode: string;
  employmentType: string;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  /** Null when the employer chose not to publish the band. */
  salaryMinMinor: number | null;
  salaryMaxMinor: number | null;
  salaryPublic: boolean;
  openings: number;
  skills: string[];
  status: string;
  publishedAt: string | null;
  applicationDeadline: string | null;
}

/** Columns shared by the search list and the job detail projections. */
const listSelection = {
  id: jobs.id,
  title: jobs.title,
  companyId: jobs.companyId,
  companyName: companies.name,
  companySlug: companies.slug,
  location: jobs.location,
  workMode: jobs.workMode,
  employmentType: jobs.employmentType,
  experienceMinYears: jobs.experienceMinYears,
  experienceMaxYears: jobs.experienceMaxYears,
  // Never leak a confidential band: hidden unless salaryPublic is true.
  salaryMinMinor: sql<number | null>`CASE WHEN ${jobs.salaryPublic} THEN ${jobs.salaryMinMinor} ELSE NULL END`,
  salaryMaxMinor: sql<number | null>`CASE WHEN ${jobs.salaryPublic} THEN ${jobs.salaryMaxMinor} ELSE NULL END`,
  salaryPublic: jobs.salaryPublic,
  openings: jobs.openings,
  skills: jobs.skills,
  status: jobs.status,
  publishedAt: jobs.publishedAt,
  applicationDeadline: jobs.applicationDeadline,
};

/**
 * Executes a job search entirely in the database and returns one page plus an
 * exact total.
 *
 * Public callers only ever see jobs whose status is 'published'; that
 * constraint is injected server-side and cannot be overridden by a parameter.
 */
export async function searchJobs(
  filters: JobSearchFilters = {}
): Promise<JobSearchResult<JobListRow>> {
  const { db } = dbFromRequest();

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(
    Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE)),
    MAX_PAGE_SIZE
  );
  const sort: JobSort = (['recent', 'oldest', 'salary_desc', 'salary_asc', 'title'] as const).includes(
    filters.sort as JobSort
  )
    ? (filters.sort as JobSort)
    : 'recent';

  const where = and(...buildJobPredicates(filters));

  const rows = await db
    .select(listSelection)
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(where)
    .orderBy(...jobSortOrder(sort))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await db
    .select({ value: count() })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(where);

  const total = totalRow?.value ?? 0;

  return {
    items: rows.map((row) => ({
      ...row,
      skills: Array.isArray(row.skills) ? row.skills : [],
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      applicationDeadline: row.applicationDeadline
        ? row.applicationDeadline.toISOString()
        : null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
  };
}

export interface PublicJobDetail extends JobListRow {
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  educationRequirements: string | null;
  department: string | null;
  expiresAt: string | null;
}

/**
 * Fetches one published job for a public detail page. A non-published job is
 * indistinguishable from a missing one, so drafts cannot be probed by id.
 */
export async function getPublishedJob(jobId: string): Promise<PublicJobDetail> {
  const { db } = dbFromRequest();
  const rows = await db
    .select({
      ...listSelection,
      description: jobs.description,
      responsibilities: jobs.responsibilities,
      requirements: jobs.requirements,
      benefits: jobs.benefits,
      educationRequirements: jobs.educationRequirements,
      department: jobs.department,
      expiresAt: jobs.expiresAt,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(eq(jobs.id, jobId), inArray(jobs.status, [...PUBLIC_JOB_STATUSES])))
    .limit(1);

  const row = rows[0];
  if (!row) throw notFound('job');

  return {
    ...row,
    skills: Array.isArray(row.skills) ? row.skills : [],
    responsibilities: Array.isArray(row.responsibilities) ? row.responsibilities : [],
    requirements: Array.isArray(row.requirements) ? row.requirements : [],
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    applicationDeadline: row.applicationDeadline ? row.applicationDeadline.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

/** Company profile as shown on a public job page. Public fields only. */
export interface PublicCompanyProfile {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  companySize: string | null;
  location: string | null;
  description: string | null;
  website: string | null;
  verificationStatus: string;
  openJobs: number;
}

export async function getPublicCompanyProfile(companyId: string): Promise<PublicCompanyProfile> {
  const { db } = dbFromRequest();
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      industry: companies.industry,
      companySize: companies.companySize,
      location: companies.location,
      description: companies.description,
      website: companies.website,
      verificationStatus: companies.verificationStatus,
    })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.status, 'active')))
    .limit(1);

  const row = rows[0];
  if (!row) throw notFound('company');

  const [openJobs] = await db
    .select({ value: count() })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), inArray(jobs.status, [...PUBLIC_JOB_STATUSES])));

  return { ...row, openJobs: openJobs?.value ?? 0 };
}

/** Distinct filter facets for the search UI, computed in the database. */
export interface JobFacets {
  locations: string[];
  skills: string[];
  employmentTypes: string[];
  workModes: string[];
}

export async function getJobFacets(): Promise<JobFacets> {
  const { db } = dbFromRequest();

  const locationRows = await db
    .selectDistinct({ location: jobs.location })
    .from(jobs)
    .where(and(inArray(jobs.status, [...PUBLIC_JOB_STATUSES]), sql`${jobs.location} IS NOT NULL`))
    .orderBy(asc(jobs.location))
    .limit(100);

  const typeRows = await db
    .selectDistinct({ employmentType: jobs.employmentType })
    .from(jobs)
    .where(inArray(jobs.status, [...PUBLIC_JOB_STATUSES]))
    .orderBy(asc(jobs.employmentType));

  const modeRows = await db
    .selectDistinct({ workMode: jobs.workMode })
    .from(jobs)
    .where(inArray(jobs.status, [...PUBLIC_JOB_STATUSES]))
    .orderBy(asc(jobs.workMode));

  // `skills` is a jsonb array, so it is flattened with jsonb_array_elements_text
  // in the database rather than in JavaScript.
  const skillResult = await db.execute(sql`
    SELECT DISTINCT skill
      FROM jobs, jsonb_array_elements_text(${jobs.skills}) AS skill
     WHERE ${jobs.status} IN ('published')
     ORDER BY skill
     LIMIT 100
  `);

  const skills = rowsFromExecute<{ skill: string }>(skillResult)
    .map((row) => row.skill)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  return {
    locations: locationRows
      .map((row) => row.location)
      .filter((value): value is string => !!value),
    skills,
    employmentTypes: typeRows.map((row) => row.employmentType),
    workModes: modeRows.map((row) => row.workMode),
  };
}

