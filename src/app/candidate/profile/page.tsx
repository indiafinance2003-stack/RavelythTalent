import type { Metadata } from 'next';
import { CandidateProfilePage } from '@/components/portal/candidate/candidate-profile-page';

export const metadata: Metadata = {
  title: 'Your profile — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function ProfilePage(): React.ReactElement {
  return <CandidateProfilePage />;
}
