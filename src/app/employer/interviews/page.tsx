import type { Metadata } from 'next';
import { InterviewsPage } from '@/components/portal/employer/interviews-page';

export const metadata: Metadata = {
  title: 'Interviews — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <InterviewsPage />;
}