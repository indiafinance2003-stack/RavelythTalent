'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { EmployerApplication } from '@/lib/portal-client/types';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  formatDate,
  formatRelative,
} from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

const STATUSES = ['applied', 'shortlisted', 'interview', 'selected', 'rejected', 'hired'] as const;

/**
 * The employer's pipeline.
 *
 * Status changes post to the real endpoint, which enforces the transition table
 * server-side; this UI offers the statuses but cannot invent a transition the
 * backend rejects. A refusal is shown verbatim rather than the badge quietly
 * changing anyway.
 */
export function EmployerApplications(): React.ReactElement {
  const [status, setStatus] = useState('');
  const [jobId, setJobId] = useState('');
  const applications = useAsync(
    () =>
      portalGet<{ items: EmployerApplication[] }>('/api/portal/employer/applications', {
        status: status || undefined,
        jobId: jobId || undefined,
      }),
    [status, jobId]
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = applications.data?.items ?? [];

  async function move(applicationId: string, next: string): Promise<void> {
    setBusy(applicationId);
    setError(null);
    setMessage(null);
    try {
      await portalSend('PATCH', `/api/portal/employer/applications/${applicationId}`, {
        status: next,
      });
      await applications.reload();
      setMessage(`Application moved to ${next}.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Applications"
        title="Your pipeline"
        description="Every application to a role at your company. Only your own company's applicants are visible here."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant={status === '' ? 'primary' : 'secondary'} size="sm" onClick={() => setStatus('')}>
          All
        </Button>
        {STATUSES.map((value) => (
          <Button
            key={value}
            variant={status === value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setStatus(value)}
          >
            {APPLICATION_STATUS_LABELS[value]}
          </Button>
        ))}
      </div>

      <Field label="Filter by job id" htmlFor="filter-job">
        <input
          id="filter-job"
          className="w-full max-w-md rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          value={jobId}
          onChange={(event) => setJobId(event.target.value)}
          placeholder="Paste a job id to filter"
        />
      </Field>

      {applications.loading ? <LoadingState label="Loading applications…" /> : null}
      {applications.error ? (
        <ErrorState message={applications.error} onRetry={applications.reload} />
      ) : null}

      {!applications.loading && !applications.error && items.length === 0 ? (
        <EmptyState
          title="No applications match"
          description={
            status || jobId
              ? 'Try clearing the filters.'
              : 'When candidates apply to your roles, they will appear here.'
          }
        />
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader title={`${items.length} application${items.length === 1 ? '' : 's'}`} />
          <ul className="divide-y divide-line">
            {items.map((application) => (
              <li key={application.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/employer/applications/${application.id}`}
                      className="text-sm font-semibold text-ink hover:text-accent"
                    >
                      {application.candidateName ?? 'Candidate'}
                    </Link>
                    <p className="text-xs text-slate-500">
                      applied for {application.jobTitle ?? 'a role'} ·{' '}
                      {formatRelative(application.appliedAt)} ({formatDate(application.appliedAt)})
                    </p>
                    {application.candidateHeadline ? (
                      <p className="mt-1 text-sm text-slate-400">{application.candidateHeadline}</p>
                    ) : null}
                    {application.candidateLocation ? (
                      <p className="text-xs text-slate-500">{application.candidateLocation}</p>
                    ) : null}
                  </div>
                  <Badge tone={APPLICATION_STATUS_TONES[application.status as keyof typeof APPLICATION_STATUS_TONES]}>
                    {APPLICATION_STATUS_LABELS[application.status as keyof typeof APPLICATION_STATUS_LABELS] ?? application.status}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor={`move-${application.id}`} className="text-xs text-slate-500">
                    Move to
                  </label>
                  <select
                    id={`move-${application.id}`}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-sm text-ink"
                    value={application.status}
                    disabled={busy === application.id}
                    onChange={(event) => move(application.id, event.target.value)}
                  >
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {APPLICATION_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <Link
                    href={`/employer/applications/${application.id}`}
                    className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent hover:text-accent"
                  >
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}