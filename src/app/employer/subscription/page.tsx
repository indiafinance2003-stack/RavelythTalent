import type { Metadata } from 'next';
import { SubscriptionPage } from '@/components/portal/employer/subscription-page';

export const metadata: Metadata = {
  title: 'Your subscription — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <SubscriptionPage />;
}