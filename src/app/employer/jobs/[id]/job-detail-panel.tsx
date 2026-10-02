'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { EmployerJob } from '@/lib/portal-client/types';
import {
  EMPLOYMENT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  WORK_MODE_LABELS,
  formatDate,
  formatSalaryBand,
} from '@/lib/portal-client/format';
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
 * Manage one job: view it, edit the editable fields, submit or withdraw it.
 *
 * `postedForCompanyId` is NOT editable. Re-pointing a live vacancy at a different
 * client after publication would bypass the agency authorisation check that ran
 * when the job was created.
 *
 * A material edit to a job a moderator already looked at returns
 * `requiresReapproval`, and this page says so rather than implying the change is
 * already live.
 */
export function EmployerJobDetail(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const job = useAsync(() => portalGet<{ job: EmployerJob }>(`/api/portal/employer/jobs/${jobId}`), [jobId]);
  const [values, setValues] = useState<Record<string, string | boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const data = job.data?.job;

  const current = values ?? (data
    ? {
        title: data.title ?? '',
        department: data.department ?? '',
        location: data.location ?? '',
        employmentType: data.employmentType,
        workMode: data.workMode,
        openings: String(data.openings),
        description: data.description ?? '',
        salaryPublic: data.salaryPublic,
      }
    : {});

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await portalSend<{
        job: EmployerJob;
        requiresReapproval: boolean;
      }>('PATCH', `/api/portal/employer/jobs/${jobId}`, {
        title: current.title,
        department: current.department || null,
        location: current.location || null,
        employmentType: current.employmentType,
        workMode: current.workMode,
        openings: Number(current.openings) || 1,
        description: current.description,
        salaryPublic: Boolean(current.salaryPublic),
      });
      await job.reload();
      setValues(null);
      // Report what the server decided, not what we hoped would happen.
      setMessage(
        result.requiresReapproval
          ? 'Saved. Because a moderator had already reviewed this posting, it is back with them for another look.'
          : 'Job updated.'
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await portalSend('PUT', '/api/portal/employer/jobs', { jobId });
      await job.reload();
      setMessage('Submitted for review.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(): Promise<void> {
    if (!window.confirm('Withdraw this job back to draft? Any consumed credit is returned.')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await portalSend('DELETE', `/api/portal/employer/jobs/${jobId}`, {});
      await job.reload();
      setMessage('Withdrawn. Any consumed credit has been returned.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (job.loading) return <LoadingState label="Loading this jobâ€¦" />;
  if (job.error) return <ErrorState message={job.error} onRetry={job.reload} />;
  if (!data) return <ErrorState message="This job could not be loaded." />;

  const editable = data.status === 'draft' || data.status === 'rejected' || data.status === 'pending_approval';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manage job"
        title={data.title}
        description={`${EMPLOYMENT_TYPE_LABELS[data.employmentType as 'full_time'] ?? data.employmentType} Â· ${WORK_MODE_LABELS[data.workMode as 'onsite'] ?? data.workMode}`}
        action={
          <Link href="/employer/jobs" className="text-sm text-slate-400 hover:text-accent">
            Back to jobs
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={JOB_STATUS_TONES[data.status as keyof typeof JOB_STATUS_TONES]}>
          {JOB_STATUS_LABELS[data.status as keyof typeof JOB_STATUS_LABELS] ?? data.status}
        </Badge>
        {data.postedForCompanyId ? (
          <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">Posted for a client</Badge>
        ) : null}
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {data.status === 'rejected' && data.rejectionReason ? (
        <Alert kind="warning">
          <span className="font-medium">A moderator asked for changes: </span>
          {data.rejectionReason}
        </Alert>
      ) : null}

      {data.status === 'published' ? (
        <Alert kind="info">
          This role is live.{' '}
          <Link href={`/jobs/${data.id}`} className="underline">
            View the public page
          </Link>
          . Closing it later keeps it out of search while leaving its applications intact.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Job details"
          description={editable ? 'Edit and save. Changes may send the job back for review.' : 'This job can no longer be edited.'}
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Title" htmlFor="d-title">
            <input
              id="d-title"
              className={inputClass}
              value={String(current.employmentType)}
              disabled={!editable}
              onChange={(event) => setValues({ ...current, title: event.target.value })}
            />
          </Field>
          <Field label="Department" htmlFor="d-dept">
            <input
              id="d-dept"
              className={inputClass}
              value={String(current.workMode)}
              disabled={!editable}
              onChange={(event) => setValues({ ...current, department: event.target.value })}
            />
          </Field>
          <Field label="Location" htmlFor="d-location">
            <input
              id="d-location"
              className={inputClass}
              value={String(current.openings)}
              disabled={!editable}
              onChange={(event) => setValues({ ...current, location: event.target.value })}
            />
          </Field>
          <Field label="Openings" htmlFor="d-openings">
            <input
              id="d-openings"
              type="number"
              min={1}
              className={inputClass}
              value={String(current.openings)}
              disabled={!editable}
              onChange={(event) => setValues({ ...current, openings: event.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" htmlFor="d-description">
              <textarea
                id="d-description"
                rows={6}
                className={inputClass}
                value={String(current.description)}
                disabled={!editable}
                onChange={(event) => setValues({ ...current, description: event.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(current.salaryPublic)}
              disabled={!editable}
              onChange={(event) => setValues({ ...current, salaryPublic: event.target.checked })}
              className="h-4 w-4 accent-[#2563eb]"
            />
            <span className="text-sm text-slate-300">Show the salary band publicly</span>
          </label>
        </div>

        {editable ? (
          <div className="flex flex-wrap gap-2 border-t border-line p-5">
            <Button onClick={save} loading={busy}>
              Save changes
            </Button>
            {data.status === 'draft' || data.status === 'rejected' ? (
              <Button variant="secondary" onClick={submit} loading={busy}>
                Submit for review
              </Button>
            ) : null}
            {data.status === 'pending_approval' ? (
              <Button variant="danger" onClick={withdraw} loading={busy}>
                Withdraw to draft
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="At a glance" />
        <dl className="grid gap-3 p-5 sm:grid-cols-2">
          <Row label="Salary band">
            {formatSalaryBand(data.salaryMinMinor, data.salaryMaxMinor, data.salaryPublic)}
          </Row>
          <Row label="Skills">{(data.skills ?? []).join(', ') || 'None listed'}</Row>
          <Row label="Created">{formatDate(data.createdAt)}</Row>
          <Row label="Published">{data.publishedAt ? formatDate(data.publishedAt) : 'Not yet'}</Row>
          <Row label="Expires">{data.expiresAt ? formatDate(data.expiresAt) : 'No expiry set'}</Row>
          <Row label="Applications close">
            {data.applicationDeadline ? formatDate(data.applicationDeadline) : 'No deadline'}
          </Row>
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-300">{children}</dd>
    </div>
  );
}