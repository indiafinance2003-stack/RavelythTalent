import type { Metadata } from 'next';
import { CandidateApplications } from '@/components/portal/candidate/candidate-applications';

export const metadata: Metadata = {
  title: 'Your applications — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function ApplicationsPage(): React.ReactElement {
  return <CandidateApplications />;
}
