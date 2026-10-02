import type { Metadata } from 'next';
import { PackagesPage } from '@/components/portal/employer/packages-page';

export const metadata: Metadata = {
  title: 'Job packages and credits — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <PackagesPage />;
}
