import Link from "next/link";
import { Filter, X } from "lucide-react";
import { JOB_TYPE_LABEL, WORK_MODE_LABEL } from "@/lib/utils";
import type { CategoryWithCount } from "@/lib/companies/queries";
import { Field, Input, Select } from "@/components/ui/primitives";

export type JobFilterValues = {
  q?: string | undefined;
  location?: string | undefined;
  category?: string | undefined;
  jobType?: string | undefined;
  workMode?: string | undefined;
  company?: string | undefined;
  salaryMin?: string | undefined;
  experience?: string | undefined;
  postedWithin?: string | undefined;
  sort?: string | undefined;
};

const SALARY_OPTIONS = [
  { value: "", label: "Any salary" },
  { value: "300000000", label: "\u20B93L+" },
  { value: "600000000", label: "\u20B96L+" },
  { value: "1000000000", label: "\u20B910L+" },
  { value: "2000000000", label: "\u20B920L+" },
];

const EXPERIENCE_OPTIONS = [
  { value: "", label: "Any experience" },
  { value: "0-2", label: "Fresher - 2 years" },
  { value: "3-5", label: "3 - 5 years" },
  { value: "6-9", label: "6 - 9 years" },
  { value: "10-", label: "10+ years" },
];

const POSTED_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

/** GET form so every filtered view is shareable and crawlable. */
export function JobFilters({
  values,
  categories,
}: {
  values: JobFilterValues;
  categories: CategoryWithCount[];
}) {
  const activeCount = [
    values.category,
    values.jobType,
    values.workMode,
    values.salaryMin,
    values.experience,
    values.postedWithin,
    values.location,
    values.company,
  ].filter(Boolean).length;

  return (
    <form
      method="get"
      action="/jobs"
      className="surface sticky top-20 space-y-4 p-5"
      aria-label="Filter jobs"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeCount > 0 ? (
            <span className="rounded-full bg-royal-50 px-2 py-0.5 text-xs font-semibold text-royal">
              {activeCount}
            </span>
          ) : null}
        </h2>
        {activeCount > 0 ? (
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-royal"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Link>
        ) : null}
      </div>

      {values.q ? <input type="hidden" name="q" value={values.q} /> : null}

      <Field label="Location" htmlFor="location">
        <Input
          id="location"
          name="location"
          defaultValue={values.location ?? ""}
          placeholder="Bengaluru"
        />
      </Field>

      <Field label="Category" htmlFor="category">
        <Select id="category" name="category" defaultValue={values.category ?? ""}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name} ({category.openJobs})
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Job type" htmlFor="jobType">
        <Select id="jobType" name="jobType" defaultValue={values.jobType ?? ""}>
          <option value="">Any job type</option>
          {Object.entries(JOB_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Work mode" htmlFor="workMode">
        <Select id="workMode" name="workMode" defaultValue={values.workMode ?? ""}>
          <option value="">Any work mode</option>
          {Object.entries(WORK_MODE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Annual salary" htmlFor="salaryMin">
        <Select id="salaryMin" name="salaryMin" defaultValue={values.salaryMin ?? ""}>
          {SALARY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Experience" htmlFor="experience">
        <Select id="experience" name="experience" defaultValue={values.experience ?? ""}>
          {EXPERIENCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Date posted" htmlFor="postedWithin">
        <Select id="postedWithin" name="postedWithin" defaultValue={values.postedWithin ?? ""}>
          {POSTED_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Company" htmlFor="company">
        <Input
          id="company"
          name="company"
          defaultValue={values.company ?? ""}
          placeholder="Company name"
        />
      </Field>

      {values.sort ? <input type="hidden" name="sort" value={values.sort} /> : null}

      <button
        type="submit"
        className="w-full rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-royal-600"
      >
        Apply filters
      </button>

      {values.q ? (
        <Link
          href={`/jobs?${new URLSearchParams({ q: values.q }).toString()}`}
          className="block text-center text-xs font-semibold text-slate-500 hover:text-royal"
        >
          Search for &ldquo;{values.q}&rdquo; only
        </Link>
      ) : null}
    </form>
  );
}

/** Relevance / newest toggle that preserves the active filters. */
export function JobSortToggle({
  sort,
  params,
}: {
  sort: string | undefined;
  params: Record<string, string | undefined>;
}) {
  const build = (value: string) =>
    `/jobs?${new URLSearchParams(
      Object.entries({ ...params, sort: value }).filter(([, v]) => v),
    ).toString()}`;

  const active = (value: string) =>
    value === "newest" ? sort === "newest" : sort !== "newest";

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-600">Sort by</span>
      <Link
        href={build("relevance")}
        className={`rounded-lg px-3 py-1.5 font-semibold ${
          active("relevance")
            ? "bg-royal text-white"
            : "border border-slate-300 bg-white text-navy hover:border-royal"
        }`}
        aria-current={active("relevance") ? "true" : undefined}
      >
        Relevance
      </Link>
      <Link
        href={build("newest")}
        className={`rounded-lg px-3 py-1.5 font-semibold ${
          active("newest")
            ? "bg-royal text-white"
            : "border border-slate-300 bg-white text-navy hover:border-royal"
        }`}
        aria-current={active("newest") ? "true" : undefined}
      >
        Newest
      </Link>
    </div>
  );
}