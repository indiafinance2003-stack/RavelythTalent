'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { AgencyClientsResponse, CreditBalance, EmployerJob } from '@/lib/portal-client/types';
import {
  EMPLOYMENT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
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
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * The employer's job list.
 *
 * Statuses are grouped so the employer can see at a glance what needs their
 * attention. Every transition is a real API call, and a rejection is shown with
 * the moderator's reason because that is what the employer must act on.
 */
export function EmployerJobs(): React.ReactElement {
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get('submitted') === '1';
  const justDrafted = searchParams.get('draft') === '1';

  const [filter, setFilter] = useState('');
  const jobs = useAsync(
    () =>
      portalGet<{ items: EmployerJob[]; credits: CreditBalance }>('/api/portal/employer/jobs', {
        status: filter || undefined,
      }),
    [filter]
  );
  const clients = useAsync(
    () => portalGet<AgencyClientsResponse>('/api/portal/employer/company/clients'),
    []
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = jobs.data?.items ?? [];
  const isAgency = clients.data?.companyType === 'recruitment_agency';
  const clientName = (id: string | null) =>
    id ? clients.data?.clients.find((client) => client.clientCompanyId === id)?.name ?? null : null;

  async function submit(jobId: string): Promise<void> {
    setBusy(jobId);
    setError(null);
    setMessage(null);
    try {
      await portalSend('PUT', '/api/portal/employer/jobs', { jobId });
      await jobs.reload();
      setMessage('Submitted for review. You will be emailed when a moderator decides.');
    } catch (caught) {
      // A 402 here means the credit ran out; surface the server's own wording.
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(jobId: string): Promise<void> {
    if (!window.confirm('Withdraw this job back to draft? Any consumed credit is returned.')) return;
    setBusy(jobId);
    setError(null);
    setMessage(null);
    try {
      await portalSend('DELETE', `/api/portal/employer/jobs/${jobId}`, {});
      await jobs.reload();
      setMessage('Job withdrawn and any consumed credit returned.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jobs"
        title="Your job postings"
        description="Drafts, postings awaiting review, live roles and anything a moderator has sent back."
        action={
          <Link
            href="/employer/jobs/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Post a job
          </Link>
        }
      />

      {justSubmitted ? (
        <Alert kind="success">
          Your job was submitted for review. It goes live once a Ravelyth moderator approves it.
        </Alert>
      ) : null}
      {justDrafted ? <Alert kind="success">Draft saved. Submit it when you are ready.</Alert> : null}
      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {[
          { value: '', label: 'All' },
          { value: 'draft', label: 'Drafts' },
          { value: 'pending_approval', label: 'Awaiting review' },
          { value: 'published', label: 'Live' },
          { value: 'rejected', label: 'Needs changes' },
          { value: 'closed', label: 'Closed' },
          { value: 'expired', label: 'Expired' },
        ].map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {jobs.loading ? <LoadingState label="Loading your jobs…" /> : null}
      {jobs.error ? <ErrorState message={jobs.error} onRetry={jobs.reload} /> : null}

      {!jobs.loading && !jobs.error && items.length === 0 ? (
        <EmptyState
          title={filter ? `No ${filter.replace(/_/g, ' ')} jobs` : 'You have not posted a job yet'}
          description={
            filter
              ? 'Try a different filter, or post a new role.'
              : 'Save a draft, then submit it for review when you are ready.'
          }
          action={
            <Link
              href="/employer/jobs/new"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Post a job
            </Link>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((job) => (
            <li key={job.id}>
              <Card>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {job.title}
                      <Badge tone={JOB_STATUS_TONES[job.status as keyof typeof JOB_STATUS_TONES]}>
                        {JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS] ?? job.status}
                      </Badge>
                      {isAgency && job.postedForCompanyId ? (
                        <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">
                          For {clientName(job.postedForCompanyId) ?? 'a client'}
                        </Badge>
                      ) : null}
                    </span>
                  }
                  description={`${EMPLOYMENT_TYPE_LABELS[job.employmentType as 'full_time'] ?? job.employmentType} · created ${formatRelative(job.createdAt)}${job.expiresAt ? ` · expires ${formatDate(job.expiresAt)}` : ''}`}
                  action={
                    <Link
                      href={`/employer/jobs/${job.id}`}
                      className="text-sm font-medium text-accent-soft hover:text-accent"
                    >
                      Manage &rarr;
                    </Link>
                  }
                />

                <div className="flex flex-wrap items-center gap-2 p-5">
                  {job.status === 'draft' || job.status === 'rejected' ? (
                    <Button size="sm" loading={busy === job.id} onClick={() => submit(job.id)}>
                      Submit for review
                    </Button>
                  ) : null}
                  {job.status === 'pending_approval' || job.status === 'rejected' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy === job.id}
                      onClick={() => withdraw(job.id)}
                    >
                      Withdraw to draft
                    </Button>
                  ) : null}
                  {job.status === 'published' ? (
                    <Link
                      href={`/jobs/${job.id}`}
                      className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent hover:text-accent"
                    >
                      View the public page
                    </Link>
                  ) : null}
                </div>

                {job.status === 'rejected' && job.rejectionReason ? (
                  <div className="px-5 pb-5">
                    <Alert kind="warning">
                      <span className="font-medium">Why this needs changes: </span>
                      {job.rejectionReason}
                    </Alert>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
