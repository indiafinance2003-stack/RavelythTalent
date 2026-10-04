import type { Metadata } from 'next';
import { AgencySubmissionsPage } from '@/components/portal/employer/agency-submissions-page';

export const metadata: Metadata = {
  title: 'Agency submissions — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AgencySubmissionsPage />;
}