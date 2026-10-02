import type { Metadata } from 'next';
import { SavedJobs } from '@/components/portal/candidate/saved-jobs';

export const metadata: Metadata = {
  title: 'Saved jobs — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function SavedJobsPage(): React.ReactElement {
  return <SavedJobs />;
}
