'use client';

import Link from 'next/link';
import type { JobListItem } from '@/lib/portal-client/types';
import {
  EMPLOYMENT_TYPE_LABELS,
  WORK_MODE_LABELS,
  formatExperienceBand,
  formatRelative,
  formatSalaryBand,
} from '@/lib/portal-client/format';
import { Badge } from '@/components/portal/ui';

/**
 * One job in a list.
 *
 * Renders only what the API returned. A null salary band reads as "Salary not
 * disclosed" rather than as a fabricated range, and an absent location is simply
 * omitted rather than shown as "Remote".
 */
export function JobCard({
  job,
  footer,
}: {
  job: JobListItem;
  footer?: React.ReactNode;
}): React.ReactElement {
  const experience = formatExperienceBand(job.experienceMinYears, job.experienceMaxYears);

  return (
    <article className="flex flex-col rounded-xl border border-line bg-navy-surface p-5 transition hover:border-accent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">
            <Link href={`/jobs/${job.id}`} className="hover:text-accent">
              {job.title}
            </Link>
          </h3>
          <p className="mt-1 truncate text-sm text-slate-400">{job.companyName}</p>
        </div>
        {job.openings > 1 ? <Badge>{job.openings} openings</Badge> : null}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <div className="flex gap-1">
          <dt className="sr-only">Employment type</dt>
          <dd>{EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="sr-only">Work mode</dt>
          <dd>{WORK_MODE_LABELS[job.workMode] ?? job.workMode}</dd>
        </div>
        {job.location ? (
          <div className="flex gap-1">
            <dt className="sr-only">Location</dt>
            <dd>{job.location}</dd>
          </div>
        ) : null}
        {experience ? (
          <div className="flex gap-1">
            <dt className="sr-only">Experience</dt>
            <dd>{experience}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-3 text-sm font-medium text-slate-300">
        {formatSalaryBand(job.salaryMinMinor, job.salaryMaxMinor, job.salaryPublic)}
      </p>

      {job.skills.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {job.skills.slice(0, 5).map((skill) => (
            <li key={skill}>
              <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">{skill}</Badge>
            </li>
          ))}
          {job.skills.length > 5 ? (
            <li>
              <Badge>+{job.skills.length - 5} more</Badge>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-slate-500">
          {job.publishedAt ? `Posted ${formatRelative(job.publishedAt)}` : null}
        </p>
        <Link
          href={`/jobs/${job.id}`}
          className="text-sm font-medium text-accent-soft hover:text-accent"
        >
          View role &rarr;
        </Link>
      </div>

      {footer ? <div className="mt-3 border-t border-line pt-3">{footer}</div> : null}
    </article>
  );
}
