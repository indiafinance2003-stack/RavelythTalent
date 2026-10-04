import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { getCategoriesWithCounts } from "@/lib/companies/queries";
import { searchJobs } from "@/lib/jobs/queries";
import { JobCardView } from "@/components/jobs/job-card";
import { JobFilters, JobSortToggle } from "@/components/jobs/job-filters";
import { Pagination } from "@/components/ui/pagination";
import {
  ButtonLink,
  DecorCircles,
  EmptyState,
  Input,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const location = typeof params.location === "string" ? params.location : undefined;

  return {
    title: q
      ? `${q}${location ? ` jobs in ${location}` : " jobs"}`
      : location
        ? `Jobs in ${location}`
        : "Find jobs across India",
    description: q
      ? `Search verified job openings for ${q}${location ? ` in ${location}` : ""} on Ravelyth Talent.`
      : "Browse verified job openings across India by role, city, salary and work mode.",
  };
}

function str(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single && single.trim() ? single.trim() : undefined;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const experience = str(params, "experience");
  const [expMinRaw, expMaxRaw] = experience ? experience.split("-") : [undefined, undefined];

  const salaryMinRaw = str(params, "salaryMin");
  const postedWithinRaw = str(params, "postedWithin");

  const input = {
    q: str(params, "q"),
    location: str(params, "location"),
    category: str(params, "category"),
    jobType: str(params, "jobType"),
    workMode: str(params, "workMode"),
    company: str(params, "company"),
    salaryMin: salaryMinRaw ? Number(salaryMinRaw) : undefined,
    experienceMin: expMinRaw ? Number(expMinRaw) : undefined,
    experienceMax: expMaxRaw ? Number(expMaxRaw) : undefined,
    postedWithinDays: postedWithinRaw ? Number(postedWithinRaw) : undefined,
    sort: str(params, "sort") === "newest" ? ("newest" as const) : undefined,
    page: str(params, "page") ? Number(str(params, "page")) : 1,
  };

  const [result, categories] = await Promise.all([
    searchJobs(input),
    getCategoriesWithCounts(20),
  ]);

  const linkParams: Record<string, string | undefined> = {
    q: input.q,
    location: input.location,
    category: input.category,
    jobType: input.jobType,
    workMode: input.workMode,
    company: input.company,
    salaryMin: salaryMinRaw,
    experience,
    postedWithin: postedWithinRaw,
  };

  return (
    <div className="relative">
      <DecorCircles />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="jobs-q" className="sr-only">
            Job title, skill or company
          </label>
          <Input
            id="jobs-q"
            name="q"
            type="search"
            defaultValue={input.q ?? ""}
            placeholder="Job title, skill or company"
            className="flex-1 bg-white"
          />
          <label htmlFor="jobs-location" className="sr-only">
            Location
          </label>
          <Input
            id="jobs-location"
            name="location"
            defaultValue={input.location ?? ""}
            placeholder="City or state"
            className="sm:w-56 bg-white"
          />
          <button
            type="submit"
            className="rounded-xl bg-royal px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-royal-600"
          >
            Search
          </button>
        </form>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
          <aside>
            <JobFilters
              values={{
                ...linkParams,
                experience,
                sort: input.sort,
              }}
              categories={categories}
            />
          </aside>

          <section aria-label="Search results">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-xl font-bold text-navy sm:text-2xl">
                {result.total.toLocaleString("en-IN")} {result.total === 1 ? "job" : "jobs"}
                {input.q ? (
                  <>
                    {" "}
                    for <span className="text-royal">{input.q}</span>
                  </>
                ) : null}
              </h1>
              <JobSortToggle sort={input.sort} params={linkParams} />
            </div>

            <div className="mt-6 space-y-4">
              {result.rows.length > 0 ? (
                result.rows.map((job) => <JobCardView key={job.id} job={job} />)
              ) : (
                <EmptyState
                  icon={<SearchX className="h-10 w-10" aria-hidden="true" />}
                  title="No jobs match these filters"
                  description="Try removing a filter, widening the location, or searching for a broader role."
                  action={<ButtonLink href="/jobs">Clear all filters</ButtonLink>}
                />
              )}
            </div>

            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              basePath="/jobs"
              params={linkParams}
            />
          </section>
        </div>
      </div>
    </div>
  );
}