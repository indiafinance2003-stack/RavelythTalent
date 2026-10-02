import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/portal/admin/admin-dashboard';

export const metadata: Metadata = {
  title: 'Admin console | Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminDashboard />;
}
