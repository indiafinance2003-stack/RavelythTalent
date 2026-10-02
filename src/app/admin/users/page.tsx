import type { Metadata } from 'next';
import { AdminUsers } from '@/components/portal/admin/admin-users';

export const metadata: Metadata = {
  title: 'Users | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminUsers />;
}
