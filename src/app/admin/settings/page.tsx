import type { Metadata } from 'next';
import { AdminSettings } from '@/components/portal/admin/admin-settings';

export const metadata: Metadata = {
  title: 'Platform settings | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminSettings />;
}
