import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResumeBuilder } from '@/components/portal/candidate/resume-builder';
import { LoadingState } from '@/components/portal/ui';

export const metadata: Metadata = {
  title: 'Resume Builder — Ravelyth Talent',
  robots: { index: false, follow: false },
};

/** `useSearchParams` needs a Suspense boundary in the App Router. */
export default function ResumeBuilderPage(): React.ReactElement {
  return (
    <Suspense fallback={<LoadingState label="Loading the Resume Builder…" />}>
      <ResumeBuilder />
    </Suspense>
  );
}
