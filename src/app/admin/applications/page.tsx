import type { Metadata } from 'next';
import { AdminApplications } from '@/components/portal/admin/admin-applications';

export const metadata: Metadata = {
  title: 'Applications | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminApplications />;
}
