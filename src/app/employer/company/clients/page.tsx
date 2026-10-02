import type { Metadata } from 'next';
import { AgencyClientsPage } from '@/components/portal/employer/agency-clients-page';

export const metadata: Metadata = {
  title: 'Client companies | Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AgencyClientsPage />;
}
