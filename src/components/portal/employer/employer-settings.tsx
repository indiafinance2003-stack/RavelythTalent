'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useSession } from '@/lib/portal-client/use-session';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * Employer account settings.
 *
 * Password change requires the CURRENT password and revokes every other session,
 * so a stolen cookie on another device cannot survive it. Company details and
 * verification are managed under Company, not here, because those are moderated.
 */
export function EmployerSettings(): React.ReactElement {
  const { user, refresh } = useSession();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function changePassword(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword.length < 10) {
      setError('Your new password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const result = await portalPost<{ changed: boolean; otherSessionsRevoked: number }>(
        '/api/portal/auth/change-password',
        { currentPassword, newPassword, confirmPassword }
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(
        `Password changed.${
          result.otherSessionsRevoked > 0
            ? ` ${result.otherSessionsRevoked} other signed-in ${
                result.otherSessionsRevoked === 1 ? 'session was' : 'sessions were'
              } signed out.`
            : ''
        }`
      );
      await refresh();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Account settings"
        description="Your sign-in details and account security."
      />

      <Card>
        <CardHeader title="Your account" />
        <div className="space-y-2 p-5 text-sm">
          <p>
            <span className="text-slate-500">Name: </span>
            <span className="text-ink">{user?.name ?? '—'}</span>
          </p>
          <p>
            <span className="text-slate-500">Email: </span>
            <span className="text-ink">{user?.email ?? '—'}</span>
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">{user?.role}</Badge>
            {user?.emailVerified ? (
              <Badge tone="bg-emerald-500/10 text-emerald-300 ring-emerald-500/40">
                Email verified
              </Badge>
            ) : (
              <Badge tone="bg-amber-500/10 text-amber-300 ring-amber-500/40">
                Email not verified
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Change your password"
          description="Your current password is required. Every other signed-in session is signed out afterwards."
        />
        <form onSubmit={changePassword} noValidate className="space-y-4 p-5">
          {error ? <Alert kind="error">{error}</Alert> : null}
          {message ? <Alert kind="success">{message}</Alert> : null}

          <Field label="Current password" htmlFor="es-current">
            <input
              id="es-current"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="New password" htmlFor="es-new" hint="At least 10 characters.">
            <input
              id="es-new"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="es-confirm">
            <input
              id="es-confirm"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={busy}>
            Change password
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Other" />
        <div className="space-y-2 p-5 text-sm">
          <p>
            <Link href="/employer/company" className="text-accent-soft underline">
              Company profile and verification status
            </Link>
          </p>
          <p>
            <Link href="/notifications" className="text-accent-soft underline">
              Your notifications
            </Link>
          </p>
          <p>
            <Link href="/verify-email" className="text-accent-soft underline">
              Send a new email verification link
            </Link>
          </p>
          <p>
            <Link href="/reports/new" className="text-accent-soft underline">
              Report a problem
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
