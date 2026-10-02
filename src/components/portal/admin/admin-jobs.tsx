'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { formatDate, JOB_STATUS_LABELS, JOB_STATUS_TONES, titleCase } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AdminJobRow } from '@/lib/portal-client/types';
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
import { PageNav } from '@/components/portal/admin/pager';

/**
 * Job review and approval.
 *
 * A rejection REQUIRES a reason. That is not a formality: the reason is shown
 * to the employer, so a blank rejection would leave them with a decision they
 * cannot act on and no route to appeal it.
 *
 * The approve/reject controls only render for a pending job, because the server
 * refuses to review a job that is not awaiting approval. Hiding the control for
 * impossible states keeps the console from offering an action guaranteed to fail.
 */
export function AdminJobs(): React.ReactElement {
  const [status, setStatus] = useState('pending_approval');
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const jobs = useAsync(
    () =>
      portalGet<{ items: AdminJobRow[]; limit: number }>(
        `/api/portal/admin/jobs?limit=25&offset=${offset}${status ? `&status=${status}` : ''}`
      ),
    [status, offset]
  );

  async function review(job: AdminJobRow, decision: 'approve' | 'reject'): Promise<void> {
    setError(null);
    setMessage(null);

    let reason: string | null = null;
    if (decision === 'reject') {
      const entered = window.prompt(
        `Why are you rejecting "${job.title}"? The employer sees this reason and can edit and resubmit.`
      );
      if (entered === null) return;
      if (entered.trim().length === 0) {
        setError('A reason is required to reject a job.');
        return;
      }
      reason = entered.trim();
    } else if (!window.confirm(`Approve and publish "${job.title}"?`)) {
      return;
    }

    setBusyId(job.id);
    try {
      await portalSend('PUT', `/api/portal/admin/jobs?jobId=${job.id}`, { decision, reason });
      await jobs.reload();
      setMessage(
        decision === 'approve'
          ? `"${job.title}" is published.`
          : `"${job.title}" rejected, and the employer can now see your reason.`
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  const items = jobs.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Jobs and approvals"
        description="Approve or reject postings. A rejection must carry a reason the employer can act on."
        action={
          <Link href="/jobs" className="text-sm text-accent-soft">
            View the public job board
          </Link>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[12rem] flex-1">
            <label className={labelClass} htmlFor="aj-status">
              Status
            </label>
            <select
              id="aj-status"
              className={inputClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="pending_approval">Awaiting approval</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="">All jobs</option>
            </select>
          </div>
          <p className="text-sm text-slate-500">{items.length} on this page</p>
        </div>
      </Card>

      {jobs.loading ? <LoadingState label="Loading jobs…" /> : null}
      {jobs.error ? <ErrorState message={jobs.error} onRetry={jobs.reload} /> : null}

      {items.length === 0 && !jobs.loading ? (
        <Card>
          <div className="p-5">
            <EmptyState
              title={
                status === 'pending_approval'
                  ? 'Nothing is waiting for approval'
                  : 'No jobs match this filter'
              }
              description={
                status === 'pending_approval'
                  ? 'New postings appear here as employers submit them.'
                  : undefined
              }
            />
          </div>
        </Card>
      ) : null}

      {items.map((job) => (
        <Card key={job.id}>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{job.title}</h3>
                <p className="text-xs text-slate-500">
                  {[
                    job.location,
                    job.employmentType ? titleCase(job.employmentType) : null,
                    job.workMode ? titleCase(job.workMode) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Company <span className="text-slate-400">{job.companyId}</span>
                  {job.postedForCompanyId ? (
                    <>
                      {' '}
                      · posted for <span className="text-slate-400">{job.postedForCompanyId}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={JOB_STATUS_TONES[job.status] ?? 'bg-slate-800 text-slate-300 ring-slate-600'}>
                  {JOB_STATUS_LABELS[job.status] ?? job.status}
                </Badge>
                {job.salaryPublic ? null : (
                  <Badge tone="bg-slate-800 text-slate-400 ring-slate-700">Salary private</Badge>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Submitted {formatDate(job.createdAt)}
              {job.publishedAt ? ` · published ${formatDate(job.publishedAt)}` : ''}
              {job.expiresAt ? ` · expires ${formatDate(job.expiresAt)}` : ''}
            </p>

            {job.rejectionReason ? (
              <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
                Rejected: {job.rejectionReason}
              </p>
            ) : null}

            {job.status === 'pending_approval' ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busyId === job.id} onClick={() => review(job, 'approve')}>
                  Approve and publish
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busyId === job.id}
                  onClick={() => review(job, 'reject')}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ))}

      <PageNav offset={offset} hasNext={items.length === 25} onChange={setOffset} />
    </div>
  );
}

