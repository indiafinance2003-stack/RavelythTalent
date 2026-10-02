import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { ValidationError } from '@/lib/errors/app-error';
import {
  getJobFacets,
  searchJobs,
  type JobSearchFilters,
} from '@/lib/portal/jobs/search';
import { parsePagination } from '@/lib/portal/jobs/filters';
import {
  EMPLOYMENT_TYPES,
  WORK_MODES,
} from '@/lib/db/portal-schema';

/**
 * GET /api/portal/jobs
 *
 * PUBLIC job search. Every filter is applied in SQL; this handler only
 * validates and passes the parameters. The published-status constraint is
 * injected server-side by the service and cannot be overridden here.
 *
 * Query parameters:
 *   keyword, title, companyId, companyName, location,
 *   experienceMin, experienceMax, salaryMin, employmentType, workMode,
 *   skills (comma separated), industry, postedWithinDays,
 *   page, pageSize, sort (recent|oldest|salary_desc|salary_asc|title),
 *   facets=1 to return the filter facets instead of results.
 */

/** Parses an optional integer, rejecting nonsense rather than coercing it. */
function optionalInt(value: string | undefined, field: string): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError(`${field} must be a non-negative integer.`);
  }
  return parsed;
}

/** Validates an enum-ish parameter against the allowed values. */
function optionalEnum(
  value: string | undefined,
  allowed: readonly string[],
  field: string
): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `${field} must be one of: ${allowed.join(', ')}.`
    );
  }
  return value;
}

function buildFilters(params: Record<string, string>): JobSearchFilters {
  const { page, pageSize } = parsePagination(params);

  const skills = params.skills
    ? params.skills
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)
    : undefined;

  const postedWithinDays = optionalInt(params.postedWithinDays, 'postedWithinDays');

  return {
    keyword: params.keyword,
    title: params.title,
    companyId: params.companyId,
    companyName: params.companyName,
    location: params.location,
    experienceMin: optionalInt(params.experienceMin, 'experienceMin'),
    experienceMax: optionalInt(params.experienceMax, 'experienceMax'),
    salaryMin: optionalInt(params.salaryMin, 'salaryMin'),
    employmentType: optionalEnum(params.employmentType, EMPLOYMENT_TYPES, 'employmentType'),
    workMode: optionalEnum(params.workMode, WORK_MODES, 'workMode'),
    industry: params.industry,
    skills,
    postedWithinDays,
    page,
    pageSize,
    sort: (params.sort ?? 'recent') as JobSearchFilters['sort'],
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const params = parseSearchParams(req);

    // Facet request for the filter UI.
    if (params.facets === '1' || params.facets === 'true') {
      return getJobFacets();
    }

    return searchJobs(buildFilters(params));
  });
}

