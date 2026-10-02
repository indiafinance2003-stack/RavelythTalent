import type { Metadata } from 'next';
import { ResumeManager } from '@/components/portal/candidate/resume-manager';

export const metadata: Metadata = {
  title: 'Your resumes — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function ResumesPage(): React.ReactElement {
  return <ResumeManager />;
}
