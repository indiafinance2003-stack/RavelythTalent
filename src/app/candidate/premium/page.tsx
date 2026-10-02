import type { Metadata } from 'next';
import { CandidatePremium } from '@/components/portal/candidate/candidate-premium';

export const metadata: Metadata = {
  title: 'Premium — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <CandidatePremium />;
}
