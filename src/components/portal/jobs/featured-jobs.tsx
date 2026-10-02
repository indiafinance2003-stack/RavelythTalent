'use client';

import Link from 'next/link';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { JobSearchResult } from '@/lib/portal-client/types';
import { JobCard } from '@/components/portal/jobs/job-card';

/**
 * A short preview of live openings on the homepage.
 *
 * Reads the REAL public search endpoint with a small page size. If the request
 * fails the section is omitted entirely rather than showing an invented list, so
 * a logged-out visitor is never shown placeholder jobs that do not exist.
 */
export function FeaturedJobs(): React.ReactElement | null {
  const { data, loading } = useAsync(
    () => portalGet<JobSearchResult>('/api/portal/jobs', { pageSize: 6, sort: 'recent' }),
    []
  );

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Latest openings</h2>
        <p className="mt-3 text-sm text-slate-400" role="status">
          Loading live openingsÃ¢â‚¬Â¦
        </p>
      </section>
    );
  }

  // Nothing published, or the request failed. Either way, show no fake rows.
  if (!data || data.items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Latest openings</h2>
          <p className="mt-1 text-sm text-slate-400">
            {data.total} live {data.total === 1 ? 'role' : 'roles'} on the portal right now.
          </p>
        </div>
        <Link href="/jobs" className="text-sm font-medium text-accent-soft hover:text-accent">
          View all jobs &rarr;
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.items.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>

    </section>
  );
}
