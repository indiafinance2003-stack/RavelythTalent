import type { Metadata } from 'next';
import { CandidateInterviews } from '@/components/portal/candidate/interviews';

export const metadata: Metadata = {
  title: 'Your interviews — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <CandidateInterviews />;
}