import type { Metadata } from 'next';
import { EmployerDashboard } from '@/components/portal/employer/employer-dashboard';

export const metadata: Metadata = {
  title: 'Employer dashboard — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function EmployerPage(): React.ReactElement {
  return <EmployerDashboard />;
}
