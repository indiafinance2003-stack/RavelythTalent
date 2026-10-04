import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { requireNotificationUser, withNotificationErrors } from '@/lib/notifications/api';
import {
  countUnreadNotifications,
  listNotifications,
  notificationDeliveryStatus,
} from '@/lib/notifications/notifications';

/** Lists the signed-in customer's notifications, newest first. */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    withNotificationErrors(async () => {
      const user = await requireNotificationUser();
      const unreadOnly = req.nextUrl.searchParams.get('unread') === 'true';
      const limitParam = req.nextUrl.searchParams.get('limit');
      const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
      const notifications = await listNotifications(user.id, {
        unreadOnly,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      const unreadCount = await countUnreadNotifications(user.id);
      return { notifications, unreadCount, delivery: notificationDeliveryStatus() };
    })
  );
}
