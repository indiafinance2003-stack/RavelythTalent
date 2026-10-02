import type { Metadata } from 'next';
import { AdminJobs } from '@/components/portal/admin/admin-jobs';

export const metadata: Metadata = {
  title: 'Jobs and approvals | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminJobs />;
}
