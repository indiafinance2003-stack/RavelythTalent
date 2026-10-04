import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import { requireNotificationUser, withNotificationErrors } from '@/lib/notifications/api';
import { markAllNotificationsRead } from '@/lib/notifications/notifications';

/** Marks every unread notification for the signed-in customer as read. */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    withNotificationErrors(async () => {
      const user = await requireNotificationUser();
      const updated = await markAllNotificationsRead(user.id);
      return { updated };
    })
  );
}
