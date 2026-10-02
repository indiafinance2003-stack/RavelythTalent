import type { Metadata } from 'next';
import { AdminCompanies } from '@/components/portal/admin/admin-companies';

export const metadata: Metadata = {
  title: 'Companies and agencies | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminCompanies />;
}
