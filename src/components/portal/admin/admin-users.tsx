'use client';

import { useState } from 'react';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { formatRelative, titleCase } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AdminUserRow } from '@/lib/portal-client/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  inputClass,
  labelClass,
} from '@/components/portal/ui';
import { Pager } from '@/components/portal/admin/pager';

/**
 * The roles an admin may assign.
 *
 * Mirrors the server's closed set exactly. `admin` is deliberately absent: it
 * is not assignable, and offering it in a dropdown would promise a privilege
 * the request would then reject. An account that is already an admin keeps its
 * label so the row stays readable without implying it can be changed.
 */
const ASSIGNABLE_ROLES = ['candidate', 'employer', 'customer'] as const;

/**
 * The admin user list, with suspension, reinstatement and role changes.
 *
 * Every action reloads from the server before it reports success, so this screen
 * can never show a state the database did not accept.
 */
export function AdminUsers(): React.ReactElement {
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const users = useAsync(
    () =>
      portalGet<{ items: AdminUserRow[]; total: number }>(
        `/api/portal/admin/users?limit=25&offset=${offset}` +
          `${role ? `&role=${role}` : ''}${status ? `&status=${status}` : ''}`
      ),
    [role, status, offset]
  );

  async function act(user: AdminUserRow, action: Record<string, unknown>): Promise<void> {
    setError(null);
    setMessage(null);
    let payload = action;

    if (action.action === 'suspend') {
      const reason = window.prompt(
        `Why are you suspending ${user.email}? This reason is required and is written to the audit log.`
      );
      if (reason === null) return;
      if (reason.trim().length === 0) {
        setError('A suspension reason is required.');
        return;
      }
      const ok = window.confirm(
        `Suspend ${user.email}? They are signed out of every device and cannot sign back in until reinstated.`
      );
      if (!ok) return;
      payload = { ...payload, reason: reason.trim() };
    } else if (action.action === 'reinstate') {
      if (!window.confirm(`Reinstate ${user.email}?`)) return;
    } else if (action.action === 'set_role') {
      const nextRole = String(action.role);
      if (nextRole === user.role) return;
      const ok = window.confirm(
        `Change ${user.email} from ${user.role} to ${nextRole}? This changes what the account can see immediately.`
      );
      if (!ok) return;
    }

    setBusyId(user.id);
    try {
      await portalSend('PUT', '/api/portal/admin/users', payload);
      await users.reload();
      setMessage(`${user.email} updated.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  const items = users.data?.items ?? [];
  const total = users.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Suspend, reinstate, or change the role of any account. Every action is audited."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[10rem] flex-1">
            <label className={labelClass} htmlFor="au-role">
              Role
            </label>
            <select
              id="au-role"
              className={inputClass}
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All roles</option>
              {ASSIGNABLE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className={labelClass} htmlFor="au-status">
              Status
            </label>
            <select
              id="au-status"
              className={inputClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <p className="text-sm text-slate-500">{total} matching accounts</p>
        </div>
      </Card>

      {users.loading ? <LoadingState label="Loading users…" /> : null}
      {users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Account</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last sign-in</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{user.name || '—'}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    {!user.emailVerified ? (
                      <p className="text-xs text-amber-400">Email not verified</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      aria-label={`Role for ${user.email}`}
                      className="rounded-md border border-line bg-navy-surface px-2 py-1 text-xs"
                      value={user.role}
                      disabled={busyId === user.id}
                      onChange={(event) =>
                        act(user, { action: 'set_role', role: event.target.value })
                      }
                    >
                      {user.role === 'admin' ? <option value="admin">Admin</option> : null}
                      {ASSIGNABLE_ROLES.map((option) => (
                        <option key={option} value={option}>
                          {titleCase(option)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      tone={
                        user.accountStatus === 'suspended'
                          ? 'bg-red-500/10 text-red-300 ring-red-500/40'
                          : 'bg-slate-800 text-slate-300 ring-slate-600'
                      }
                    >
                      {titleCase(user.accountStatus)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{formatRelative(user.lastLoginAt)}</td>
                  <td className="px-5 py-3">
                    {user.accountStatus === 'suspended' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={busyId === user.id}
                        onClick={() => act(user, { action: 'reinstate' })}
                      >
                        Reinstate
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busyId === user.id}
                        onClick={() => act(user, { action: 'suspend' })}
                      >
                        Suspend
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && !users.loading ? (
          <div className="p-5">
            <EmptyState title="No accounts match these filters" />
          </div>
        ) : null}
      </Card>

      <Pager offset={offset} limit={25} total={total} onChange={setOffset} />
    </div>
  );
}

