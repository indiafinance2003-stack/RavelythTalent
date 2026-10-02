import { Suspense } from 'react';
import type { Metadata } from 'next';
import { JobSearch } from '@/components/portal/jobs/job-search';
import { LoadingState } from '@/components/portal/ui';

export const metadata: Metadata = {
  title: 'Browse Jobs — Ravelyth Talent',
  description:
    'Search live vacancies on Ravelyth Talent by keyword, location, experience, salary, employment type, work mode and skills.',
  alternates: { canonical: '/jobs' },
};

/**
 * Public job search.
 *
 * `useSearchParams` requires a Suspense boundary in the App Router, hence the
 * wrapper. The page itself is a server component so the metadata and the shell
 * render without waiting for any client data.
 */
export default function JobsPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Browse jobs</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Every opening below is published and reviewed. Use the filters to narrow by keyword, location,
          experience, salary, employment type, work mode and skills.
        </p>
      </header>

      <Suspense fallback={<LoadingState label="Loading job search…" />}>
        <JobSearch />
      </Suspense>
    </div>
  );
}
