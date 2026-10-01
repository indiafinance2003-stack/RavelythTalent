import { asc, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { companies, jobs, PUBLIC_JOB_STATUSES } from '@/lib/db/portal-schema';
import { ValidationError } from '@/lib/errors/app-error';

/**
 * Shared, pure job-search filter logic.
 *
 * CRITICAL: every filter becomes a SQL predicate. Nothing in this module (or in
 * `search.ts`) loads rows and filters them in JavaScript — the previous
 * implementation fetched up to 200 rows and filtered in memory, which both
 * truncated results and made deep filtering silently wrong.
 *
 * Keeping the predicate builder pure also makes the filter rules directly unit
 * testable without a database.
 */

/** Sort options exposed to callers. */
export const JOB_SORT_OPTIONS = ['recent', 'oldest', 'salary_desc', 'salary_asc', 'title'] as const;
export type JobSort = (typeof JOB_SORT_OPTIONS)[number];

/** Normalised job search filters. */
export interface JobSearchFilters {
  /** Free-text keyword matched against title, description, location, skills, company. */
  keyword?: string;
  title?: string;
  companyId?: string;
  companyName?: string;
  location?: string;
  /** Inclusive experience band the candidate is looking for, in years. */
  experienceMin?: number;
  experienceMax?: number;
  /** Annual salary floor, in minor units (paise). */
  salaryMin?: number;
  employmentType?: string;
  workMode?: string;
  /** Every listed skill must be present on the job (AND semantics). */
  skills?: string[];
  industry?: string;
  /** Published within the last N days. */
  postedWithinDays?: number;
  /** Only jobs whose application deadline is on/after this instant. */
  applicationDeadlineAfter?: Date;
  page?: number;
  pageSize?: number;
  sort?: JobSort;
}

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

/** Escapes LIKE/ILIKE metacharacters so a keyword is matched literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Trims a keyword and caps its length; returns undefined when empty. */
export function normalizeKeyword(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, 120);
}

/** Normalises a skill list to lowercase, de-duplicated and capped. */

/**
 * Builds the WHERE predicate shared by the count query and the page query, so
 * a reported total can never disagree with the rows returned.
 *
 * The published-status filter is always included and is never caller
 * controllable: a candidate cannot widen results to drafts by passing a
 * `status` parameter.
 */
export function buildJobPredicates(filters: JobSearchFilters): SQL[] {
  const predicates: SQL[] = [inArray(jobs.status, [...PUBLIC_JOB_STATUSES])];

  const keyword = normalizeKeyword(filters.keyword);
  if (keyword) {
    const pattern = `%${escapeLikePattern(keyword)}%`;
    // `skills` is text[]; `&&` checks overlap with a single-element array.
    const skillMatch = sql`${jobs.skills}::text[] && ARRAY[${keyword.toLowerCase()}]::text[]`;
    predicates.push(
      sql`(${ilike(jobs.title, pattern)} or ${ilike(jobs.description, pattern)} or ${ilike(
        jobs.location,
        pattern
      )} or ${ilike(companies.name, pattern)} or ${skillMatch})`
    );
  }

  const title = normalizeKeyword(filters.title);
  if (title) {
    predicates.push(ilike(jobs.title, `%${escapeLikePattern(title)}%`));
  }

  if (filters.companyId) predicates.push(sql`${jobs.companyId} = ${filters.companyId}`);

  const companyName = normalizeKeyword(filters.companyName);
  if (companyName) {
    predicates.push(ilike(companies.name, `%${escapeLikePattern(companyName)}%`));
  }

  const location = normalizeKeyword(filters.location);
  if (location) {
    predicates.push(ilike(jobs.location, `%${escapeLikePattern(location)}%`));
  }

  // Experience overlap: a candidate asking for 3-5 years wants jobs whose band
  // intersects that range, not only jobs fully contained inside it. An unset
  // bound means "open ended", which always intersects.
  if (filters.experienceMin !== undefined) {
    predicates.push(
      sql`(${jobs.experienceMaxYears} IS NULL OR ${jobs.experienceMaxYears} >= ${filters.experienceMin})`
    );
  }
  if (filters.experienceMax !== undefined) {
    predicates.push(
      sql`(${jobs.experienceMinYears} IS NULL OR ${jobs.experienceMinYears} <= ${filters.experienceMax})`
    );
  }

  // A job matches a salary floor when its upper bound reaches it.
  if (filters.salaryMin !== undefined) {
    predicates.push(
      sql`(${jobs.salaryMaxMinor} IS NULL OR ${jobs.salaryMaxMinor} >= ${filters.salaryMin})`
    );
  }

  if (filters.employmentType) predicates.push(sql`${jobs.employmentType} = ${filters.employmentType}`);
  if (filters.workMode) predicates.push(sql`${jobs.workMode} = ${filters.workMode}`);

  if (filters.industry) {
    predicates.push(ilike(companies.industry, `%${escapeLikePattern(filters.industry)}%`));
  }

  // One containment predicate per skill gives AND semantics across skills.
  for (const skill of normalizeSkillList(filters.skills)) {
    predicates.push(sql`${jobs.skills} @> ARRAY[${skill}]::text[]`);
  }

  if (filters.postedWithinDays !== undefined && filters.postedWithinDays > 0) {
    const since = new Date(Date.now() - filters.postedWithinDays * 24 * 60 * 60 * 1000);
    predicates.push(sql`${jobs.publishedAt} >= ${since}`);
  }

  if (filters.applicationDeadlineAfter) {
    predicates.push(
      sql`(${jobs.applicationDeadline} IS NULL OR ${jobs.applicationDeadline} >= ${filters.applicationDeadlineAfter})`
    );
  }

  return predicates;
}

/** Deterministic ordering, always with `id` as a tie-breaker for stable paging. */
export function jobSortOrder(sort: JobSort | undefined) {
  switch (sort) {
    case 'oldest':
      return [asc(jobs.publishedAt), asc(jobs.id)];
    case 'salary_desc':
      return [sql`${jobs.salaryMaxMinor} DESC NULLS LAST`, asc(jobs.id)];
    case 'salary_asc':
      return [sql`${jobs.salaryMaxMinor} ASC NULLS LAST`, asc(jobs.id)];
    case 'title':
      return [asc(jobs.title), asc(jobs.id)];
    case 'recent':
    default:
      return [sql`${jobs.publishedAt} DESC`, asc(jobs.id)];
  }
}

/** Validates and clamps raw pagination input from a query string. */
export function parsePagination(input: { page?: string; pageSize?: string }): {
  page: number;
  pageSize: number;
} {
  const page = Number.parseInt(input.page ?? '1', 10);
  const pageSize = Number.parseInt(input.pageSize ?? String(DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(page) || page < 1) {
    throw new ValidationError('page must be a positive integer.');
  }
  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ValidationError(`pageSize must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return { page, pageSize };
}

export function normalizeSkillList(skills: string[] | undefined): string[] {
  if (!Array.isArray(skills)) return [];
  const unique = new Set<string>();
  for (const skill of skills) {
    if (typeof skill !== 'string') continue;
    const normalized = skill.trim().toLowerCase();
    if (normalized.length > 0) unique.add(normalized);
    if (unique.size >= 20) break;
  }
  return [...unique];
}
