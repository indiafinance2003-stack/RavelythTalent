'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { NotificationDTO } from '@/lib/portal-client/types';
import { formatRelative } from '@/lib/portal-client/format';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * Notifications for any signed-in portal account.
 *
 * These are the in-app rows the backend writes for application, job, moderation
 * and payment events. They are the durable record: an email that bounced still
 * leaves a notification here, which is exactly why they exist alongside mail.
 *
 * Marking read is a real POST, and the list is reloaded afterwards so the
 * unread badge cannot drift from what the server recorded.
 */
export function NotificationList(): React.ReactElement {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notifications = useAsync(
    () =>
      portalGet<{ notifications: NotificationDTO[]; unreadCount: number }>(
        '/api/account/notifications',
        { unread: unreadOnly ? 'true' : undefined, limit: 50 }
      ),
    [unreadOnly]
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unreadCount ?? 0;

  async function markRead(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await portalPost(`/api/account/notifications/${id}/read`, {});
      await notifications.reload();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await portalPost('/api/account/notifications/read-all', {});
      await notifications.reload();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Your notifications"
        description="Application updates, job decisions and billing activity, kept here even if an email never arrives."
        action={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAllRead} loading={busy}>
              Mark all as read
            </Button>
          ) : null
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}

      <div className="flex items-center gap-2">
        <Button variant={unreadOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setUnreadOnly(false)}>
          All
        </Button>
        <Button variant={unreadOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setUnreadOnly(true)}>
          Unread {unread > 0 ? `(${unread})` : ''}
        </Button>
      </div>

      {notifications.loading ? <LoadingState label="Loading notifications…" /> : null}
      {notifications.error ? (
        <ErrorState message={notifications.error} onRetry={notifications.reload} />
      ) : null}

      {!notifications.loading && !notifications.error && items.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'Nothing unread' : 'No notifications yet'}
          description={
            unreadOnly
              ? 'You are all caught up.'
              : 'You will be notified here when an application moves, a job is approved, or a payment is confirmed.'
          }
        />
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader title={`${items.length} notification${items.length === 1 ? '' : 's'}`} />
          <ul className="divide-y divide-line">
            {items.map((notification) => (
              <li
                key={notification.id}
                className={`p-4 ${notification.read ? '' : 'bg-accent-tint/30'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {!notification.read ? (
                        <span
                          aria-hidden="true"
                          className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle"
                        />
                      ) : null}
                      {notification.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{notification.body}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatRelative(notification.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent hover:text-accent"
                      >
                        View
                      </Link>
                    ) : null}
                    {!notification.read ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy}
                        onClick={() => markRead(notification.id)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
