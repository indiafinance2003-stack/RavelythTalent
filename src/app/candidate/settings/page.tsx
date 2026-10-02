import type { Metadata } from 'next';
import { AccountSettings } from '@/components/portal/candidate/account-settings';

export const metadata: Metadata = {
  title: 'Account settings — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AccountSettings />;
}
