import type { Metadata } from 'next';
import { EmployerApplicationDetail } from './application-panel';

export const metadata: Metadata = {
  title: 'Application — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function EmployerApplicationPage(): React.ReactElement {
  return <EmployerApplicationDetail />;
}
