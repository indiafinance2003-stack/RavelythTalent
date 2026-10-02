import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ReportsPage } from '@/components/portal/reports-page';
import { LoadingState } from '@/components/portal/ui';

export const metadata: Metadata = {
  title: 'Reports and complaints — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return (
    <Suspense fallback={<LoadingState label="Loading reports…" />}>
      <ReportsPage />
    </Suspense>
  );
}
