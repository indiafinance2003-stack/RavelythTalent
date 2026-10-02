import type { Metadata } from 'next';
import { EmployerSettings } from '@/components/portal/employer/employer-settings';

export const metadata: Metadata = {
  title: 'Account settings — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <EmployerSettings />;
}
