import type { Metadata } from 'next';
import { AdminPremiumPlans } from '@/components/portal/admin/admin-premium-plans';

export const metadata: Metadata = {
  title: 'Premium plans | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminPremiumPlans />;
}
