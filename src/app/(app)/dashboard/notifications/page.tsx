import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";
import { formatIndianDateTime } from "@/lib/utils";
import {
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  const items = await listNotifications(user.id);
  await markNotificationsRead(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Application updates, interview invitations and account alerts."
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing new"
          description="Updates about your applications and interviews will appear here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const body = (
                <>
                  <p className="text-sm font-semibold text-navy">{item.title}</p>
                  {item.body ? (
                    <p className="mt-0.5 text-sm text-slate-600">{item.body}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-400">{formatIndianDateTime(item.createdAt)}</p>
                </>
              );

              return (
                <li key={item.id} className="py-3">
                  {item.link ? (
                    <Link href={item.link} className="block hover:opacity-80">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
