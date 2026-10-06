import type { Metadata } from "next";
import { desc, ne } from "drizzle-orm";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { DeleteAccountForm } from "@/components/admin/delete-account-form";
import { changeUserStatusAction } from "@/lib/admin/user-actions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatIndianDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "User management" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; fileCleanup?: string; adminError?: string }>;
}) {
  const params = await searchParams;
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
      <PageHeader title="Users" description="Suspend, restore or safely delete non-administrator accounts." />
      {params.deleted === "1" ? (
        <Alert tone="success">The account and its database records were deleted.</Alert>
      ) : null}
      {params.fileCleanup ? (
        <Alert tone="warning">
          The account was deleted, but {params.fileCleanup} stored file(s) could not be removed. Operations cleanup is required.
        </Alert>
      ) : null}
      {params.adminError ? <Alert tone="error">{params.adminError}</Alert> : null}
      {rows.length === 0 ? <Card><p className="text-sm text-slate-600">No users found.</p></Card> : null}
      {rows.map((user) => (
        <Card className="flex flex-wrap items-start justify-between gap-4" key={user.id}>
          <div>
            <h2 className="font-bold text-navy">{user.fullName}</h2>
            <p className="text-sm text-slate-600">{user.email} · {user.role} · {user.status}</p>
            <p className="mt-1 text-xs text-slate-500">Joined {formatIndianDateTime(user.createdAt)}</p>
          </div>
          <div className="w-full sm:w-auto">
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
          </div>
          <DeleteAccountForm email={user.email} userId={user.id} />
        </Card>
      ))}
    </div>
  );
}
