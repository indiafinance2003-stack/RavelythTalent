import type { Metadata } from 'next';
import { SavedCandidatesPage } from '@/components/portal/employer/saved-candidates-page';

export const metadata: Metadata = {
  title: 'Saved candidates — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <SavedCandidatesPage />;
}