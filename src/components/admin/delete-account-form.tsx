import { deleteUserAction } from "@/lib/admin/user-actions";

export function DeleteAccountForm({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  return (
    <details className="mt-4 w-full border-t border-slate-200 pt-4">
      <summary className="cursor-pointer text-sm font-semibold text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">
        Delete account
      </summary>
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-semibold text-rose-950">
          This permanently removes the account, candidate profile, resumes and
          uploaded files, applications, notifications, sessions, saved alerts,
          built resumes and versions, and related account records.
        </p>
        <p className="mt-2 text-sm text-rose-900">
          If this recruiter owns a company with no other active members, that
          company, its jobs, reports, verification documents, logo and identity
          details will also be removed. If active teammates remain, ownership
          transfers to one of them.
        </p>
        <p className="mt-2 text-sm text-rose-900">
          Accounts with a paid payment or invoice cannot be deleted; suspend
          them instead. This action cannot be undone.
        </p>
        <form action={deleteUserAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input name="userId" type="hidden" value={userId} />
          <label className="min-w-64 flex-1 text-sm font-medium text-rose-950">
            Type {email} to confirm
            <input
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-rose-300 bg-white px-3 py-2"
              maxLength={254}
              name="confirmationEmail"
              required
              type="email"
            />
          </label>
          <button
            className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
            type="submit"
          >
            Permanently delete account
          </button>
        </form>
      </div>
    </details>
  );
}
