'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalPost, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { AgencyClientsResponse } from '@/lib/portal-client/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  ForbiddenState,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * Recruitment agency client management.
 *
 * Only a company whose type is `recruitment_agency` can hold clients; a direct
 * employer is refused by the backend and this page says so plainly rather than
 * showing an empty list that looks like a bug.
 *
 * A client is authorised by pasting its company id, which is deliberate: the
 * agency cannot silently claim any company it names, and the link is recorded in
 * the audit log as an action taken by a specific user. The backend validates the
 * pair regardless of what is submitted here.
 *
 * This grants PUBLISHING authority only. It does not create a login or any
 * dashboard access for the client company.
 */
export function AgencyClientsPage(): React.ReactElement {
  const clients = useAsync(
    () => portalGet<AgencyClientsResponse>('/api/portal/employer/company/clients'),
    []
  );

  const [clientCompanyId, setClientCompanyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isAgency = clients.data?.companyType === 'recruitment_agency';
  const entries = clients.data?.clients ?? [];

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (clientCompanyId.trim().length === 0) {
      setError('Enter the client company id you want to be authorised for.');
      return;
    }
    setBusy(true);
    try {
      await portalPost('/api/portal/employer/company/clients', {
        clientCompanyId: clientCompanyId.trim(),
      });
      setClientCompanyId('');
      await clients.reload();
      setMessage('Client authorised. You can now post vacancies on its behalf.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, name: string): Promise<void> {
    if (
      !window.confirm(
        `Revoke your authority to post for "${name}"? Jobs already published stay live, but you can no longer post new ones for them.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await portalSend<{ revoked: boolean }>(
        'DELETE',
        '/api/portal/employer/company/clients',
        { clientCompanyId: id }
      );
      await clients.reload();
      // Report the real outcome rather than assuming the link was removed.
      setMessage(
        result.revoked ? `Authority to post for "${name}" revoked.` : 'That link was already revoked.'
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (clients.loading) return <LoadingState label="Loading your client companies…" />;
  if (clients.error) return <ErrorState message={clients.error} onRetry={clients.reload} />;

  if (!isAgency) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Clients" title="Client companies" />
        <ForbiddenState message="Only a recruitment agency can be authorised to post on behalf of client companies. This account is a direct employer." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recruitment agency"
        title="Client companies"
        description="You may only post vacancies for a client listed here. Revoking a link stops new postings immediately."
        action={
          <Link href="/employer/jobs/new" className="text-sm text-accent-soft">
            Post a job for a client
          </Link>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <CardHeader
          title="Authorise a client"
          description="Paste the client company's id. The link is recorded in the audit log against your account."
        />
        <form onSubmit={add} noValidate className="space-y-4 p-5">
          <Field
            label="Client company id"
            htmlFor="cl-id"
            hint="The UUID of the company you represent."
          >
            <input
              id="cl-id"
              className={inputClass}
              value={clientCompanyId}
              onChange={(event) => setClientCompanyId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Button type="submit" loading={busy}>
            Authorise client
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Your clients" />
        <div className="p-5">
          {entries.length === 0 ? (
            <EmptyState
              title="No client companies are authorised yet"
              description="Authorise a client above, or ask Ravelyth to connect you to one."
            />
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((client) => (
                <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{client.name}</p>
                    <p className="text-xs text-slate-500">{client.clientCompanyId}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      tone={
                        client.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 ring-slate-700'
                      }
                    >
                      {client.status === 'active'
                        ? client.verified
                          ? 'Authorised · verified'
                          : 'Authorised'
                        : 'Revoked'}
                    </Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      onClick={() => revoke(client.clientCompanyId, client.name)}
                    >
                      {client.status === 'active' ? 'Revoke' : 'Restore'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Alert kind="info">
        Authorising a client lets you publish vacancies attributed to it. It does not grant the client
        any login or dashboard access, and revoking the link does not change the client&apos;s own
        account in any way.
      </Alert>
    </div>
  );
}
