import type { Metadata } from 'next';
import { CompanyPage } from '@/components/portal/employer/company-page';

export const metadata: Metadata = {
  title: 'Your company — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <CompanyPage />;
}
