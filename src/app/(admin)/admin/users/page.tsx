import type { Metadata } from "next";
import { desc, ne } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { changeUserStatusAction } from "@/lib/admin/user-actions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatIndianDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "User management" };

export default async function AdminUsersPage() {
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(ne(users.role, "admin"))
    .orderBy(desc(users.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Suspend or restore non-administrator accounts." />
      {rows.length === 0 ? <Card><p className="text-sm text-slate-600">No users found.</p></Card> : null}
      {rows.map((user) => (
        <Card className="flex flex-wrap items-center justify-between gap-4" key={user.id}>
          <div>
            <h2 className="font-bold text-navy">{user.fullName}</h2>
            <p className="text-sm text-slate-600">{user.email} · {user.role} · {user.status}</p>
            <p className="mt-1 text-xs text-slate-500">Joined {formatIndianDateTime(user.createdAt)}</p>
          </div>
          <form action={changeUserStatusAction} className="flex items-center gap-2">
            <input name="userId" type="hidden" value={user.id} />
            <label className="sr-only" htmlFor={`status-${user.id}`}>Account status</label>
            <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" defaultValue={user.status} id={`status-${user.id}`} name="status">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
            </select>
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-navy hover:border-royal" type="submit">Save</button>
          </form>
        </Card>
      ))}
    </div>
  );
}
