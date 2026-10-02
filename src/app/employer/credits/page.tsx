import type { Metadata } from 'next';
import { CreditsPage } from '@/components/portal/employer/credits-page';

export const metadata: Metadata = {
  title: 'Credit history — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <CreditsPage />;
}
