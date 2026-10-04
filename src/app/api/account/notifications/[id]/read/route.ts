import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/errors/api-handler';
import {
  assertUuid,
  requireNotificationUser,
  withNotificationErrors,
} from '@/lib/notifications/api';
import { markNotificationRead } from '@/lib/notifications/notifications';

/** Marks one owned notification as read. Ids are UUID-guarded before use. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return handleApi(
    req,
    withNotificationErrors(async () => {
      const user = await requireNotificationUser();
      const { id } = await context.params;
      assertUuid(id);
      const notification = await markNotificationRead(user.id, id);
      return { notification };
    })
  );
}
