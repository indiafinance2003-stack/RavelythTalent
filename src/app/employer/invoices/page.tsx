import type { Metadata } from 'next';
import { InvoicesPage } from '@/components/portal/employer/invoices-page';

export const metadata: Metadata = {
  title: 'Invoices — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <InvoicesPage />;
}