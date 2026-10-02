'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { portalGet } from '@/lib/portal-client/client';
import { useAsync } from '@/lib/portal-client/use-async';
import type { JobFacets, JobSearchResult } from '@/lib/portal-client/types';
import {
  EMPLOYMENT_TYPE_LABELS,
  WORK_MODE_LABELS,
  parseMoneyToMinor,
} from '@/lib/portal-client/format';
import {
  Button,
  Alert,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  inputClass,
} from '@/components/portal/ui';
import { JobCard } from '@/components/portal/jobs/job-card';

/**
 * Public job search.
 *
 * ALL filtering, sorting, faceting and pagination happens in PostgreSQL through
 * `GET /api/portal/jobs`. There is deliberately no client-side filtering of a
 * fetched page: that would silently under-report results (you can only filter
 * what you already downloaded) and would disagree with the backend's rules.
 *
 * Filter state lives in the URL, so a search is shareable and the back button
 * behaves. Facet options come from `?facets=1`, i.e. from real data rather than
 * a hardcoded list that could drift from what is published.
 */

interface Filters {
  keyword: string;
  location: string;
  employmentType: string;
  workMode: string;
  salaryMin: string;
  experienceMin: string;
  experienceMax: string;
  skills: string;
  postedWithinDays: string;
  sort: string;
  page: string;
}

const EMPTY: Filters = {
  keyword: '',
  location: '',
  employmentType: '',
  workMode: '',
  salaryMin: '',
  experienceMin: '',
  experienceMax: '',
  skills: '',
  postedWithinDays: '',
  sort: 'recent',
  page: '1',
};

function readFilters(params: URLSearchParams): Filters {
  return {
    keyword: params.get('keyword') ?? '',
    location: params.get('location') ?? '',
    employmentType: params.get('employmentType') ?? '',
    workMode: params.get('workMode') ?? '',
    salaryMin: params.get('salaryMin') ?? '',
    experienceMin: params.get('experienceMin') ?? '',
    experienceMax: params.get('experienceMax') ?? '',
    skills: params.get('skills') ?? '',
    postedWithinDays: params.get('postedWithinDays') ?? '',
    sort: params.get('sort') ?? 'recent',
    page: params.get('page') ?? '1',
  };
}

export function JobSearch(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(() => readFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const [draft, setDraft] = useState<Filters>(filters);
  const [showFilters, setShowFilters] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Keep the form in step with the URL when the user navigates back/forward.
  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const facets = useAsync(() => portalGet<JobFacets>('/api/portal/jobs', { facets: 1 }), []);

  const results = useAsync(
    () => portalGet<JobSearchResult>('/api/portal/jobs', queryFromFilters(filters)),
    [searchParams.toString()]
  );

  const push = useCallback(
    (next: Filters) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (value && value !== 'recent' && !(key === 'page' && value === '1')) {
          params.set(key, value);
        }
      }
      if (next.sort && next.sort !== 'recent') params.set('sort', next.sort);
      const query = params.toString();
      router.push(query ? `/jobs?${query}` : '/jobs');
    },
    [router]
  );

  function submit(event: React.FormEvent): void {
    event.preventDefault();

    // Salary is typed in rupees but sent as integer minor units. A value that
    // will not convert is rejected here rather than silently becoming zero.
    if (draft.salaryMin && parseMoneyToMinor(draft.salaryMin) === null) {
      setValidationError('Enter the minimum salary as a number, for example 800000.');
      return;
    }
    if (
      draft.experienceMin &&
      draft.experienceMax &&
      Number(draft.experienceMin) > Number(draft.experienceMax)
    ) {
      setValidationError('Minimum experience cannot be greater than maximum experience.');
      return;
    }

    setValidationError(null);
    push({ ...draft, page: '1' });
  }

  function update(key: keyof Filters, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function reset(): void {
    setValidationError(null);
    setDraft(EMPTY);
    push(EMPTY);
  }

  function goToPage(page: number): void {
    push({ ...filters, page: String(page) });
  }

  const total = results.data?.total ?? 0;
  const activeCount = Object.entries(filters).filter(
    ([key, value]) =>
      value &&
      key !== 'page' &&
      key !== 'sort' &&
      !(key === 'sort' && value === 'recent')
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <form onSubmit={submit} className="space-y-4" role="search" aria-label="Filter jobs">
          <Field label="Keyword" htmlFor="f-keyword">
            <input
              id="f-keyword"
              type="search"
              className={inputClass}
              value={draft.keyword}
              onChange={(event) => update('keyword', event.target.value)}
              placeholder="Title, skill or company"
            />
          </Field>

          <Field label="Location" htmlFor="f-location">
            <input
              id="f-location"
              type="text"
              className={inputClass}
              value={draft.location}
              onChange={(event) => update('location', event.target.value)}
              placeholder="City or region"
            />
          </Field>

          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            aria-controls="advanced-filters"
            className="w-full rounded-md border border-line px-3 py-2 text-sm text-slate-300 hover:border-accent hover:text-accent"
          >
            {showFilters ? 'Hide' : 'Show'} more filters
            {activeCount > 0 ? (
              <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-xs text-white">
                {activeCount}
              </span>
            ) : null}
          </button>

          <div id="advanced-filters" hidden={!showFilters} className="space-y-4">
            <Field label="Employment type" htmlFor="f-type">
              <select
                id="f-type"
                className={inputClass}
                value={draft.employmentType}
                onChange={(event) => update('employmentType', event.target.value)}
              >
                <option value="">Any type</option>
                {(facets.data?.employmentTypes ?? []).map((value) => (
                  <option key={value} value={value}>
                    {EMPLOYMENT_TYPE_LABELS[value as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Work mode" htmlFor="f-mode">
              <select
                id="f-mode"
                className={inputClass}
                value={draft.workMode}
                onChange={(event) => update('workMode', event.target.value)}
              >
                <option value="">Any</option>
                {(facets.data?.workModes ?? []).map((value) => (
                  <option key={value} value={value}>
                    {WORK_MODE_LABELS[value as keyof typeof WORK_MODE_LABELS] ?? value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Minimum salary (₹ per year)" htmlFor="f-salary" hint="Enter whole rupees.">
              <input
                id="f-salary"
                type="text"
                inputMode="numeric"
                className={inputClass}
                value={draft.salaryMin}
                onChange={(event) => update('salaryMin', event.target.value)}
                placeholder="800000"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Experience from" htmlFor="f-exp-min">
                <input
                  id="f-exp-min"
                  type="number"
                  min={0}
                  max={70}
                  className={inputClass}
                  value={draft.experienceMin}
                  onChange={(event) => update('experienceMin', event.target.value)}
                />
              </Field>
              <Field label="Experience to" htmlFor="f-exp-max">
                <input
                  id="f-exp-max"
                  type="number"
                  min={0}
                  max={70}
                  className={inputClass}
                  value={draft.experienceMax}
                  onChange={(event) => update('experienceMax', event.target.value)}
                />
              </Field>
            </div>

            <Field label="Skills" htmlFor="f-skills" hint="Comma separated, matched exactly.">
              <input
                id="f-skills"
                type="text"
                className={inputClass}
                value={draft.skills}
                onChange={(event) => update('skills', event.target.value)}
                placeholder="node, postgresql"
              />
            </Field>

            {facets.data && facets.data.skills.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-medium text-slate-300">Popular skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {facets.data.skills.slice(0, 12).map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => update('skills', skill)}
                      className="rounded-full bg-paper px-2.5 py-1 text-xs text-slate-400 hover:text-accent"
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Field label="Posted within" htmlFor="f-posted">
              <select
                id="f-posted"
                className={inputClass}
                value={draft.postedWithinDays}
                onChange={(event) => update('postedWithinDays', event.target.value)}
              >
                <option value="">Any time</option>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </Field>
          </div>

          {validationError ? <Alert kind="error">{validationError}</Alert> : null}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Search
            </Button>
            <Button variant="secondary" onClick={reset}>
              Clear
            </Button>
          </div>
        </form>
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400" role="status" aria-live="polite">
            {results.loading
              ? 'Searching…'
              : `${total} ${total === 1 ? 'job' : 'jobs'} found`}
          </p>

          <div className="flex items-center gap-2">
            <label htmlFor="f-sort" className="text-sm text-slate-400">
              Sort by
            </label>
            <select
              id="f-sort"
              className={`${inputClass} w-auto`}
              value={filters.sort}
              onChange={(event) => push({ ...filters, sort: event.target.value, page: '1' })}
            >
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest first</option>
              <option value="salary_desc">Salary: high to low</option>
              <option value="salary_asc">Salary: low to high</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>

        {results.loading ? <LoadingState label="Searching published jobs…" /> : null}
        {results.error ? <ErrorState message={results.error} onRetry={results.reload} /> : null}

        {!results.loading && !results.error && results.data && results.data.items.length === 0 ? (
          <EmptyState
            title="No jobs match those filters"
            description="Try widening the salary or experience range, clearing the keyword, or removing a filter."
            action={<Button variant="secondary" onClick={reset}>Clear all filters</Button>}
          />
        ) : null}

        {!results.loading && !results.error && results.data && results.data.items.length > 0 ? (
          <>
            <div className="grid gap-4">
              {results.data.items.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            {results.data.totalPages > 1 ? (
              <nav
                aria-label="Job results pages"
                className="mt-6 flex items-center justify-between gap-3"
              >
                <Button
                  variant="secondary"
                  disabled={results.data.page <= 1}
                  onClick={() => goToPage(results.data!.page - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-slate-400">
                  Page {results.data.page} of {results.data.totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={!results.data.hasMore}
                  onClick={() => goToPage(results.data!.page + 1)}
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

/** Maps the form state onto the backend's query parameters. */
function queryFromFilters(filters: Filters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.keyword) params.keyword = filters.keyword;
  if (filters.location) params.location = filters.location;
  if (filters.employmentType) params.employmentType = filters.employmentType;
  if (filters.workMode) params.workMode = filters.workMode;
  if (filters.skills) params.skills = filters.skills;
  if (filters.postedWithinDays) params.postedWithinDays = filters.postedWithinDays;
  if (filters.experienceMin) params.experienceMin = filters.experienceMin;
  if (filters.experienceMax) params.experienceMax = filters.experienceMax;
  if (filters.sort) params.sort = filters.sort;
  if (filters.page && filters.page !== '1') params.page = filters.page;

  // Convert the typed rupee figure to the integer minor units the API expects.
  if (filters.salaryMin) {
    const minor = parseMoneyToMinor(filters.salaryMin);
    if (minor !== null) params.salaryMin = String(minor);
  }
  return params;
}