'use client';

import { useState } from 'react';
import Link from 'next/link';
import { portalDelete, portalPost, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import { useSession } from '@/lib/portal-client/use-session';
import type { ConsentRecord } from '@/lib/portal-client/types';
import { CONSENT_LABELS, formatDate } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * Account settings: consent management and password change.
 *
 * Consent purposes are independent. Withdrawing `marketing` leaves
 * `job_application` untouched, which is the whole point of purpose-specific
 * consent; the list is rendered from the server's records so the state shown is
 * the state stored, including the policy version that was accepted.
 *
 * `account_creation` cannot be withdrawn here — the account itself is what
 * carries that consent — so it is shown as fixed rather than offering a button
 * that could only fail.
 */
export function AccountSettings(): React.ReactElement {
  const { user, refresh } = useSession();
  const consents = useAsync(
    () => portalGet<{ consents: ConsentRecord[] }>('/api/portal/candidate/consent'),
    []
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  async function withdraw(purpose: string): Promise<void> {
    if (
      !window.confirm(
        `Withdraw consent for "${CONSENT_LABELS[purpose] ?? purpose}"? Your other consents are unaffected.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await portalDelete<{ withdrawn: boolean; currentlyGranted: boolean }>(
        '/api/portal/candidate/consent',
        { purpose }
      );
      await consents.reload();
      // Report the resulting state honestly rather than assuming success.
      setMessage(
        result.withdrawn
          ? `Consent for "${CONSENT_LABELS[purpose] ?? purpose}" withdrawn.`
          : 'That consent was already withdrawn, so nothing changed.'
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function grant(purpose: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await portalSend('POST', '/api/portal/candidate/consent', { purpose, policyVersion: 'v1' });
      await consents.reload();
      setMessage(`Consent for "${CONSENT_LABELS[purpose] ?? purpose}" recorded.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    if (newPassword.length < 10) {
      setPasswordError('Your new password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }

    setChanging(true);
    try {
      const result = await portalPost<{ changed: boolean; otherSessionsRevoked: number }>(
        '/api/portal/auth/change-password',
        { currentPassword, newPassword, confirmPassword }
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(
        `Your password has been changed.${
          result.otherSessionsRevoked > 0
            ? ` ${result.otherSessionsRevoked} other signed-in ${
                result.otherSessionsRevoked === 1 ? 'session was' : 'sessions were'
              } signed out.`
            : ''
        }`
      );
      await refresh();
    } catch (caught) {
      setPasswordError(formatApiError(caught));
    } finally {
      setChanging(false);
    }
  }

  const records = consents.data?.consents ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Account settings"
        description="Control what Ravelyth may use your data for, and keep your account secure."
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
          <p>
            <span className="text-slate-500">Account type: </span>
            <span className="text-ink">{user?.role ?? '—'}</span>
          </p>
          <div className="pt-2">
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
          title="Consent and data use"
          description="Each purpose is recorded separately. Withdrawing one never affects the others."
        />
        <div className="p-5">
          {error ? (
            <div className="mb-4">
              <Alert kind="error">{error}</Alert>
            </div>
          ) : null}
          {message ? (
            <div className="mb-4">
              <Alert kind="success">{message}</Alert>
            </div>
          ) : null}

          {consents.loading ? <LoadingState label="Loading your consent record…" /> : null}
          {consents.error ? (
            <ErrorState message={consents.error} onRetry={consents.reload} />
          ) : null}

          {!consents.loading && !consents.error ? (
            <ul className="divide-y divide-line">
              {Object.entries(CONSENT_LABELS).map(([purpose, label]) => {
                const record = records.find((entry) => entry.purpose === purpose);
                const granted = Boolean(record && !record.withdrawnAt);

                return (
                  <li key={purpose} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{label}</p>
                      <p className="text-xs text-slate-500">
                        {purpose === 'account_creation'
                          ? 'Recorded when you created this account. It cannot be withdrawn separately.'
                          : record
                            ? `Policy ${record.policyVersion} · accepted ${formatDate(record.acceptedAt)}${
                                record.withdrawnAt
                                  ? ` · withdrawn ${formatDate(record.withdrawnAt)}`
                                  : ''
                              }`
                            : 'Not recorded'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {purpose === 'account_creation' ? (
                        <Badge>Required for your account</Badge>
                      ) : (
                        <>
                          <Badge
                            tone={
                              granted
                                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                                : 'bg-slate-800 text-slate-400 ring-slate-700'
                            }
                          >
                            {granted ? 'Granted' : 'Not granted'}
                          </Badge>
                          {granted ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busy}
                              onClick={() => withdraw(purpose)}
                            >
                              Withdraw
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busy}
                              onClick={() => grant(purpose)}
                            >
                              Grant
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <p className="mt-4 text-xs text-slate-500">
            See the{' '}
            <Link href="/legal/candidate-consent" className="underline">
              Candidate Consent and Data Use notice
            </Link>{' '}
            for what each purpose covers.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Change your password"
          description="Your current password is required. Every other signed-in session is signed out when you change it."
        />
        <form onSubmit={changePassword} noValidate className="space-y-4 p-5">
          {passwordError ? <Alert kind="error">{passwordError}</Alert> : null}
          {passwordMessage ? <Alert kind="success">{passwordMessage}</Alert> : null}

          <Field label="Current password" htmlFor="s-current">
            <input
              id="s-current"
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="New password" htmlFor="s-new" hint="At least 10 characters.">
            <input
              id="s-new"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="s-confirm">
            <input
              id="s-confirm"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={changing}>
            Change password
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Other actions" />
        <div className="space-y-2 p-5 text-sm">
          <p>
            <Link href="/forgot-password" className="text-accent-soft underline">
              Request a password reset email
            </Link>{' '}
            if you cannot sign in.
          </p>
          <p>
            <Link href="/verify-email" className="text-accent-soft underline">
              Send a new email verification link
            </Link>
            .
          </p>
          <p>
            <Link href="/reports/new" className="text-accent-soft underline">
              Report a job, company or person
            </Link>{' '}
            if something is wrong.
          </p>
        </div>
      </Card>
    </div>
  );
}
