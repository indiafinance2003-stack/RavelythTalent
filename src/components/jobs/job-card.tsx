import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, Clock, MapPin, Sparkles } from "lucide-react";
import type { JobCard } from "@/lib/jobs/queries";
import {
  JOB_TYPE_LABEL,
  WORK_MODE_LABEL,
  formatIndianDateTime,
  formatExperience,
  formatSalaryRange,
  labelFor,
} from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function JobCardView({
  job,
  showApply = true,
  badge,
}: {
  job: JobCard;
  showApply?: boolean;
  /** Extra chip rendered next to the featured/urgent badges (e.g. match score). */
  badge?: ReactNode;
}) {
  const location = [job.city, job.state].filter(Boolean).join(", ");

  return (
    <article className="surface group relative p-5 transition hover:shadow-lift">
      <div className="flex gap-4">
        <Link
          href={`/companies/${job.companySlug}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sky-tint text-sm font-extrabold text-navy"
          aria-label={job.companyName}
        >
          {job.companyLogoPath ? (
            <img
              src={`/api/files/logos/${job.companyLogoPath}`}
              alt=""
              className="h-full w-full object-cover"
              width={48}
              height={48}
            />
          ) : (
            initialsOf(job.companyName)
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-bold text-navy">
              <Link
                href={`/jobs/${job.slug}`}
                className="hover:text-royal focus-visible:outline-none focus-visible:underline"
              >
                {job.title}
              </Link>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {badge}
              {job.isFeatured ? (
                <Badge tone="teal">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Featured
                </Badge>
              ) : job.isUrgent ? (
                <Badge tone="warning">Urgent</Badge>
              ) : null}
            </div>
          </div>

          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <Link href={`/companies/${job.companySlug}`} className="hover:text-royal">
              {job.companyName}
            </Link>
          </p>

          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <dd>{location || "India"}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-navy">
                {labelFor(WORK_MODE_LABEL, job.workMode)}
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>{labelFor(JOB_TYPE_LABEL, job.jobType)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-navy">
                {formatExperience(job.experienceMinYears, job.experienceMaxYears)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <dd>{formatIndianDateTime(job.publishedAt ?? job.createdAt)}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-teal">
              {formatSalaryRange(
                job.salaryMinPaise,
                job.salaryMaxPaise,
                job.salaryPeriod,
                job.salaryHidden,
              )}
            </p>
            {job.categoryName ? (
              <Link href={`/jobs?category=${job.categorySlug}`}>
                <Badge tone="brand">{job.categoryName}</Badge>
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {showApply ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Link
            href={`/jobs/${job.slug}`}
            className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-navy transition hover:border-royal hover:text-royal"
          >
            View job
          </Link>
          <Link
            href={`/jobs/${job.slug}#apply`}
            className="rounded-xl bg-royal px-3.5 py-1.5 text-sm font-semibold text-white shadow-soft transition hover:bg-royal-600"
          >
            Easy Apply
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="surface p-5" aria-hidden="true">
      <div className="flex gap-4">
        <div className="skeleton h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2.5">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-1/3" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}