import type { Metadata } from 'next';
import { CandidateDashboard } from '@/components/portal/candidate/candidate-dashboard';

export const metadata: Metadata = {
  title: 'Candidate dashboard — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function CandidatePage(): React.ReactElement {
  return <CandidateDashboard />;
}
