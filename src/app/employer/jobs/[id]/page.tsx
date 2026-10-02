import type { Metadata } from 'next';
import { EmployerJobDetail } from './job-detail-panel';

export const metadata: Metadata = {
  title: 'Manage job — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function EmployerJobPage(): React.ReactElement {
  return <EmployerJobDetail />;
}
