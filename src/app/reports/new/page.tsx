import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ReportForm } from '@/components/portal/report-form';
import { LoadingState } from '@/components/portal/ui';

export const metadata: Metadata = {
  title: 'Report a problem — Ravelyth Talent',
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<{ type?: string; id?: string }> };

/** Report a specific item, reached from a job or company page. */
export default async function NewReportPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const params = await searchParams;
  const targetType = ['job', 'company', 'employer', 'candidate'].includes(params.type ?? '')
    ? (params.type as string)
    : 'job';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <ReportForm targetType={targetType} targetId={params.id ?? ''} />
      </Suspense>
    </div>
  );
}
