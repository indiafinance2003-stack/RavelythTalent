import type { Metadata } from 'next';
import { AdminPackages } from '@/components/portal/admin/admin-packages';

export const metadata: Metadata = {
  title: 'Job packages | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminPackages />;
}
