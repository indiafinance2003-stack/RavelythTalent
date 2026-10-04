import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { requirePortalUser } from '@/lib/portal/auth-context';
import { NotificationError } from '@/lib/notifications/notifications';

/**
 * API-boundary helpers for the notification routes.
 *
 * Domain errors (`NotificationError`) keep the service layer independent of the
 * HTTP layer; this single helper translates them to `AppError` so every route
 * goes through the shared `handleApi` envelope with safe, mapped status codes.
 */
export function toAppError(error: unknown): unknown {
  if (error instanceof NotificationError) {
    return new AppError(
      error.code === 'NOTIFICATION_NOT_FOUND'
        ? AppErrorCode.NOT_FOUND
        : AppErrorCode.VALIDATION_ERROR,
      error.message,
      error.status
    );
  }
  return error;
}

/**
 * Wraps a domain operation so domain errors are rethrown as mapped AppErrors.
 * Returns a closure (rather than executing immediately) so it can be handed
 * straight to `handleApi(req, withNotificationErrors(async () => ...))`.
 */
export function withNotificationErrors<T>(fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      throw toAppError(error);
    }
  };
}

/** Resolves the acting user from the session cookie, or throws 401. */
export async function requireNotificationUser() {
  try {
    return await requirePortalUser();
  } catch {
    throw new AppError(AppErrorCode.UNAUTHORIZED, 'Sign in to view your notifications.', 401);
  }
}

/** UUID guard for dynamic route segments (notification ids). */
export function assertUuid(id: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Invalid resource id.', 400);
  }
}