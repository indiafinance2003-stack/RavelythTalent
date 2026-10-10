import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { searchJobs } from "@/lib/jobs/queries";
import { buildInternshipListJsonLd } from "@/lib/seo/job-posting";
import { appUrl } from "@/lib/email/urls";
import { STIPEND_TYPE_LABEL } from "@/lib/utils";
import { JobCardView } from "@/components/jobs/job-card";
import { Pagination } from "@/components/ui/pagination";
import {
  ButtonLink,
  DecorCircles,
  EmptyState,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Internships across India",
  description:
    "Browse verified internships across India by stipend, duration, city and start date. Paid and unpaid internships from approved companies.",
  alternates: { canonical: "/internships" },
  openGraph: {
    type: "website",
    title: "Internships across India",
    description:
      "Browse verified internships across India by stipend, duration and city.",
    url: "/internships",
    siteName: "Ravelyth Talent",
  },
};

function str(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single && single.trim() ? single.trim() : undefined;
}

const DURATION_OPTIONS = [
  { value: "", label: "Any duration" },
  { value: "3", label: "Up to 3 months" },
  { value: "6", label: "Up to 6 months" },
  { value: "12", label: "Up to 12 months" },
];

const START_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "14", label: "Starts within 2 weeks" },
  { value: "30", label: "Starts within a month" },
  { value: "90", label: "Starts within 3 months" },
];

export default async function InternshipsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const stipendType = str(params, "stipendType");
  const durationRaw = str(params, "duration");
  const startRaw = str(params, "start");
  const location = str(params, "location");
  const q = str(params, "q");

  const input = {
    q,
    location,
    jobType: "internship" as const,
    stipendType,
    durationMonths: durationRaw ? Number(durationRaw) : undefined,
    startsWithinDays: startRaw ? Number(startRaw) : undefined,
    sort: str(params, "sort") === "newest" ? ("newest" as const) : undefined,
    page: str(params, "page") ? Number(str(params, "page")) : 1,
  };

  const result = await searchJobs(input);

  const linkParams: Record<string, string | undefined> = {
    q,
    location,
    stipendType,
    duration: durationRaw,
    start: startRaw,
    sort: str(params, "sort"),
  };

  const jsonLd = buildInternshipListJsonLd(
    result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      city: row.city,
      state: row.state,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      companyName: row.companyName,
    })),
    appUrl(),
  );

  return (
    <div className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <DecorCircles />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-navy sm:text-3xl">
          Internships across India
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Find paid and unpaid internships from verified companies. Filter by
          stipend, duration, city and when the internship starts.
        </p>

        <form method="get" role="search" className="mt-6 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="intern-q" className="sr-only">
            Role, skill or company
          </label>
          <Input
            id="intern-q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Role, skill or company"
            className="flex-1 bg-white"
          />
          <label htmlFor="intern-location" className="sr-only">
            City or state
          </label>
          <Input
            id="intern-location"
            name="location"
            defaultValue={location ?? ""}
            placeholder="City or state"
            className="bg-white sm:w-56"
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
            <form
              method="get"
              action="/internships"
              className="surface sticky top-20 space-y-4 p-5"
              aria-label="Filter internships"
            >
              <h2 className="text-sm font-bold text-navy">Filters</h2>
              {q ? <input type="hidden" name="q" value={q} /> : null}
              {location ? (
                <input type="hidden" name="location" value={location} />
              ) : null}

              <Field label="Stipend type" htmlFor="stipendType">
                <Select
                  id="stipendType"
                  name="stipendType"
                  defaultValue={stipendType ?? ""}
                >
                  <option value="">Any stipend type</option>
                  {Object.entries(STIPEND_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Duration" htmlFor="duration">
                <Select id="duration" name="duration" defaultValue={durationRaw ?? ""}>
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Start date" htmlFor="start">
                <Select id="start" name="start" defaultValue={startRaw ?? ""}>
                  {START_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <button
                type="submit"
                className="w-full rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-royal-600"
              >
                Apply filters
              </button>

              <Link
                href="/internships"
                className="block text-center text-xs font-semibold text-slate-500 hover:text-royal"
              >
                Clear filters
              </Link>
            </form>
          </aside>

          <section aria-label="Internship results">
            <h2 className="text-xl font-bold text-navy">
              {result.total.toLocaleString("en-IN")}{" "}
              {result.total === 1 ? "internship" : "internships"}
            </h2>

            <div className="mt-6 space-y-4">
              {result.rows.length > 0 ? (
                result.rows.map((job) => <JobCardView key={job.id} job={job} />)
              ) : (
                <EmptyState
                  icon={<SearchX className="h-10 w-10" aria-hidden="true" />}
                  title="No internships match these filters"
                  description="Try removing a filter, widening the location, or searching for a broader role."
                  action={<ButtonLink href="/internships">Clear all filters</ButtonLink>}
                />
              )}
            </div>

            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              basePath="/internships"
              params={linkParams}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
