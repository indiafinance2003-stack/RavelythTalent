import type { Metadata } from 'next';
import { AdminAudit } from '@/components/portal/admin/admin-audit';

export const metadata: Metadata = {
  title: 'Audit log | Ravelyth Talent admin',
  robots: { index: false, follow: false },
};

export default function Page(): React.ReactElement {
  return <AdminAudit />;
}
