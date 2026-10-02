import type { Metadata } from 'next';
import { EmployerJobs } from '@/components/portal/employer/employer-jobs';

export const metadata: Metadata = {
  title: 'Your jobs — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function EmployerJobsPage(): React.ReactElement {
  return <EmployerJobs />;
}
