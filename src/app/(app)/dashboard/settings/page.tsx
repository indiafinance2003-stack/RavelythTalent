import { requireUser } from "@/lib/auth/current-user";
import { logoutAllDevicesAction } from "@/lib/auth/actions";
import {
  Card,
  PageHeader,
} from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Account and security options." />

      <Card>
        <h2 className="text-base font-bold text-navy">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-600">Full name</dt>
            <dd className="font-semibold text-navy">{user.fullName}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-600">Email</dt>
            <dd className="font-semibold text-navy">{user.email}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-600">Phone</dt>
            <dd className="font-semibold text-navy">{user.phone ?? "Not added"}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-600">Email verified</dt>
            <dd className="font-semibold text-navy">
              {user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "Not verified"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-navy">Security</h2>
        <p className="mt-2 text-sm text-slate-600">
          Signing out of all devices revokes every active session, including this
          one. You will need to sign in again.
        </p>
        <form action={logoutAllDevicesAction} className="mt-4">
          <button
            type="submit"
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Log out of all devices
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          To change your password, use the{" "}
          <a href="/forgot-password" className="font-semibold text-royal hover:underline">
            password reset
          </a>{" "}
          link. You will be signed out everywhere afterwards.
        </p>
      </Card>
    </div>
  );
}
