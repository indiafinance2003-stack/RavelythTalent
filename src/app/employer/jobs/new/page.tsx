import type { Metadata } from 'next';
import { NewJobForm } from '@/components/portal/employer/new-job-form';

export const metadata: Metadata = {
  title: 'Post a job — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function NewJobPage(): React.ReactElement {
  return <NewJobForm />;
}
