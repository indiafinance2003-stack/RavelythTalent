'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { portalDownload, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { EmployerApplication, StatusHistoryEntry } from '@/lib/portal-client/types';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  formatDate,
  formatDateTime,
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
 * One applicant, with the full decision history.
 *
 * The resume link is only offered because the backend permits this exact read:
 * an employer may open a candidate's resume ONLY for a real application to a job
 * at their own company, and the download is recorded in an access log the
 * candidate can review. A refused read returns 404, and this shows that message
 * rather than implying the file is missing.
 */
export function EmployerApplicationDetail(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const applicationId = params.id;

  const application = useAsync(
    () =>
      portalGet<{ application: EmployerApplication; history: StatusHistoryEntry[] }>(
        `/api/portal/employer/applications/${applicationId}`
      ),
    [applicationId]
  );

  const [note, setNote] = useState('');
  const [employerNotes, setEmployerNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function move(status: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await portalSend('PATCH', `/api/portal/employer/applications/${applicationId}`, {
        status,
        note: note.trim() || null,
        employerNotes: employerNotes.trim() || null,
      });
      await application.reload();
      setNote('');
      setMessage('Application updated.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (application.loading) return <LoadingState label="Loading this application…" />;
  if (application.error) return <ErrorState message={application.error} onRetry={application.reload} />;

  const data = application.data?.application;
  const history = application.data?.history ?? [];

  async function downloadResume(): Promise<void> {
    if (!data?.resumeVersionId) return;
    setResumeError(null);
    try {
      // Goes through the authorised endpoint, which re-checks that this
      // employer may read THIS version and records the access.
      await portalDownload(
        `/api/portal/candidate/resumes/versions/${data.resumeVersionId}`,
        (data.candidateName ? `resume-${data.candidateName}` : 'Resume')
      );
    } catch (caught) {
      setResumeError(formatApiError(caught));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Application"
        title="Applicant"
        description="Every status change is recorded with who made it and when."
        action={
          <Link href="/employer/applications" className="text-sm text-slate-400 hover:text-accent">
            Back to pipeline
          </Link>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <CardHeader
          title="Applicant"
          action={
            data?.resumeVersionId ? (
              <Button variant="secondary" size="sm" onClick={downloadResume}>
                Download resume
              </Button>
            ) : null
          }
        />
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-ink">
              {data?.candidateName ?? 'Unknown candidate'}
            </p>
            {data ? (
              <Badge tone={APPLICATION_STATUS_TONES[data.status as keyof typeof APPLICATION_STATUS_TONES]}>
                {APPLICATION_STATUS_LABELS[data.status as keyof typeof APPLICATION_STATUS_LABELS] ?? data.status}
              </Badge>
            ) : null}
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Applied for</dt>
              <dd className="mt-1 text-sm text-slate-300">{data?.jobTitle ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Applied on</dt>
              <dd className="mt-1 text-sm text-slate-300">
              {data ? formatDate(data.appliedAt) : '--'}
              </dd>
            </div>
          </dl>

          {data?.coverLetter ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Cover letter</p>
              <p className="mt-1 whitespace-pre-line rounded-lg bg-paper p-3 text-sm leading-relaxed text-slate-300">
                {data.coverLetter}
              </p>
            </div>
          ) : null}

          {resumeError ? <Alert kind="error">{resumeError}</Alert> : null}

          {data && !data.resumeVersionId ? (
            <p className="text-xs text-slate-500">
              The candidate did not attach a resume to this application.
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Status history" />
        <div className="p-5">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No status changes recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((entry, index) => (
                <li key={`${entry.createdAt}-${index}`} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"
                  />
                  <div>
                    <p className="text-sm text-slate-300">
                      {entry.fromStatus
                        ? `${entry.fromStatus.replace(/_/g, ' ')} → ${entry.toStatus.replace(/_/g, ' ')}`
                        : `Applied (${entry.toStatus.replace(/_/g, ' ')})`}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                    {entry.note ? (
                      <p className="mt-1 text-sm text-slate-400">{entry.note}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Move this application" />
        <div className="space-y-4 p-5">
          <Field label="Note to the candidate (optional)" htmlFor="ap-note">
            <textarea
              id="ap-note"
              rows={2}
              className={inputClass}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Field label="Private notes for your team" htmlFor="ap-notes">
            <textarea
              id="ap-notes"
              rows={3}
              className={inputClass}
              value={employerNotes}
              onChange={(event) => setEmployerNotes(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            {(['shortlisted', 'interview', 'selected', 'hired', 'rejected'] as const).map((status) => (
              <Button
                key={status}
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => move(status)}
              >
                Move to {APPLICATION_STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}