import type { Metadata } from 'next';
import { JobDetail } from './job-detail';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Job details — Ravelyth Talent',
    // The portal must not index individual vacancies aggressively; the search
    // page is the canonical entry point for job discovery.
    robots: { index: false, follow: true },
    alternates: { canonical: `/jobs/${id}` },
  };
}

/**
 * Public job detail page.
 *
 * The job id is validated in the API and a non-published job is reported as 404,
 * so there is no separate "preview" path that could leak a draft.
 */
export default async function JobPage({ params }: PageProps): Promise<React.ReactElement> {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <JobDetail jobId={id} />
    </div>
  );
}
