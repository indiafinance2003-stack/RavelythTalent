import type { Metadata } from 'next';
import { EmployerApplications } from '@/components/portal/employer/employer-applications';

export const metadata: Metadata = {
  title: 'Applications — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function EmployerApplicationsPage(): React.ReactElement {
  return <EmployerApplications />;
}
