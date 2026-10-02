import type { Metadata } from 'next';
import { NotificationList } from '@/components/portal/notification-list';

export const metadata: Metadata = {
  title: 'Notifications — Ravelyth Talent',
  robots: { index: false, follow: false },
};

export default function NotificationsPage(): React.ReactElement {
  return <NotificationList />;
}
