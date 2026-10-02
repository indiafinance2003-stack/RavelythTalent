import type { Metadata } from 'next';
import { JobAlerts } from '@/components/portal/candidate/job-alerts';

export const metadata: Metadata = {
  title: 'Your job alerts — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <JobAlerts />;
}
