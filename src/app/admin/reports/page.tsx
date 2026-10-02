import type { Metadata } from 'next';
import { AdminReports } from '@/components/portal/admin/admin-reports';

export const metadata: Metadata = {
  title: 'Reports | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminReports />;
}
