import type { Metadata } from 'next';
import { AdminPayments } from '@/components/portal/admin/admin-payments';

export const metadata: Metadata = {
  title: 'Orders and payments | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminPayments />;
}
