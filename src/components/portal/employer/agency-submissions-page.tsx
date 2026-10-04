'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalGet, portalPost, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import type {
  AgencySubmissionDTO,
  AgencySubmissionEventDTO,
  AgencySubmissionStatus,
} from '@/lib/portal-client/types';
import { formatDateTime } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * Candidates put forward to clients, and candidates received from agencies.
 *
 * The two sides of this screen are genuinely different relationships, and the
 * permitted next statuses differ because of it:
 *
 *  - AS THE AGENCY: you submit and you may withdraw. You do not decide the
 *    outcome — that is the client's judgement about their own vacancy.
 *  - AS THE CLIENT: you review, you reject, you shortlist. You cannot withdraw
 *    somebody else's submission.
 *
 * `asAgency` from the API says which side this company is on, so the buttons
 * shown are the ones the server will actually accept rather than a guess. The
 * server enforces the same rule regardless of what is rendered here.
 *
 * Consent is never supplied by this screen. Every submission carries a NOT NULL
 * reference to a real candidate consent row, so a candidate who has not agreed
 * to be shared cannot be submitted at all — the database refuses it.
 */
export function AgencySubmissionsPage(): React.ReactElement {
  const submissions = useAsync(
    () => portalGet<{ items: AgencySubmissionDTO[] }>('/api/portal/employer/agency-submissions'),
    []
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);

  const items = submissions.data?.items ?? [];

  async function move(row: AgencySubmissionDTO, status: AgencySubmissionStatus, note: string): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(row.id);
    try {
      await portalSend('PATCH', `/api/portal/employer/agency-submissions/${row.id}`, {
        status,
        note: note.trim() || null,
      });
      await submissions.reload();
      setMessage('Submission updated.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }
return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agency"
        title="Submissions"
        description="Candidates your agency has put forward, and candidates agencies have put forward to you."
        action={
          <Button variant="secondary" size="sm" onClick={() => setOpenForm((open) => !open)}>
            {openForm ? 'Close' : 'Submit a candidate'}
          </Button>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {openForm ? (
        <SubmitForm
          busy={busy === 'submit'}
          onDone={async () => {
            setOpenForm(false);
            await submissions.reload();
            setMessage('Candidate submitted to the client company.');
          }}
          onCancel={() => setOpenForm(false)}
        />
      ) : null}

      {submissions.loading ? <LoadingState label="Loading submissions…" /> : null}
      {submissions.error ? (
        <ErrorState message={submissions.error} onRetry={submissions.reload} />
      ) : null}

      {!submissions.loading && !submissions.error && items.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="Submissions appear here once a candidate is put forward for a client's job."
        />
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((row) => (
            <SubmissionCard
              key={row.id}
              submission={row}
              busy={busy === row.id}
              onMove={(status, note) => move(row, status, note)}
            />
          ))}
        </div>
      ) : null}

      <Alert kind="info">
        A submission is only created when the candidate has given consent to be shared with employers.
        If a candidate has not consented, the request is refused — an agency cannot override that.{' '}
        <Link href="/employer/company/clients" className="underline">
          Manage your clients
        </Link>
        .
      </Alert>
    </div>
  );
}
/**
 * Which next statuses each side may pick.
 *
 * This mirrors the server's transition table. Showing only the legal moves is
 * what stops a recruiter clicking something that will be refused — but the
 * server enforces the same rule regardless, so this is a courtesy, not the
 * control.
 */
const AGENCY_MOVES: { status: AgencySubmissionStatus; label: string }[] = [
  { status: 'withdrawn', label: 'Withdraw' },
];

const CLIENT_MOVES: Record<string, { status: AgencySubmissionStatus; label: string }[]> = {
  submitted: [
    { status: 'under_review', label: 'Start reviewing' },
    { status: 'rejected', label: 'Reject' },
  ],
  under_review: [
    { status: 'client_interview', label: 'Move to interview' },
    { status: 'rejected', label: 'Reject' },
  ],
  client_interview: [
    { status: 'client_selected', label: 'Select' },
    { status: 'rejected', label: 'Reject' },
  ],
};

const STATUS_TONES: Record<AgencySubmissionStatus, string> = {
  submitted: 'bg-slate-800 text-slate-300 ring-slate-600',
  under_review: 'bg-amber-500/10 text-amber-300 ring-amber-500/40',
  client_interview: 'bg-sky-500/10 text-sky-300 ring-sky-500/40',
  client_selected: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40',
  rejected: 'bg-slate-800 text-slate-400 ring-slate-700',
  withdrawn: 'bg-slate-800 text-slate-400 ring-slate-700',
};

/** One submission, with only the moves the caller's side of the relationship allows. */
function SubmissionCard({
  submission,
  busy,
  onMove,
}: {
  submission: AgencySubmissionDTO;
  busy: boolean;
  onMove: (status: AgencySubmissionStatus, note: string) => Promise<void>;
}): React.ReactElement {
  const [note, setNote] = useState('');
  const moves = submission.asAgency ? AGENCY_MOVES : (CLIENT_MOVES[submission.status] ?? []);

  return (
    <Card>
      <CardHeader
        title={`${submission.candidateName} — ${submission.jobTitle}`}
        description={`${submission.asAgency ? 'Submitted by you to' : 'Submitted by'} ${
          submission.asAgency ? submission.clientName : submission.agencyName
        } · ${formatDateTime(submission.submittedAt)}`}
        action={<Badge tone={STATUS_TONES[submission.status]}>{submission.status.replace(/_/g, ' ')}</Badge>}
      />
      <div className="space-y-3 p-5">
        {submission.notes ? (
          <p className="whitespace-pre-line rounded-lg bg-paper p-3 text-xs leading-relaxed text-slate-400">
            {submission.notes}
          </p>
        ) : null}
        {moves.length > 0 ? (
          <>
            <Field label="Note (optional)" htmlFor={`sub-note-${submission.id}`}>
              <input
                id={`sub-note-${submission.id}`}
                className={inputClass}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {moves.map((move) => (
                <Button
                  key={move.status}
                  size="sm"
                  variant={move.status === 'rejected' || move.status === 'withdrawn' ? 'danger' : 'primary'}
                  loading={busy}
                  onClick={() => void onMove(move.status, note)}
                >
                  {move.label}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">
            {submission.asAgency
              ? 'This submission has reached a decision. Only the client company can move it further.'
              : 'This submission is closed. The history below records how it got here.'}
          </p>
        )}
        <SubmissionHistory submissionId={submission.id} />
      </div>
    </Card>
  );
}
/**
 * The submitting form.
 *
 * It takes a job id and a candidate id and NOTHING else. The client company is
 * derived server-side from the agency's active client links, so an agency cannot
 * name a company it has no authority to submit to, and the candidate's consent
 * is looked up rather than asserted. There is deliberately no consent checkbox
 * here: the browser cannot consent on somebody else's behalf.
 */
function SubmitForm({
  busy,
  onDone,
  onCancel,
}: {
  busy: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  const [jobId, setJobId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!jobId.trim() || !candidateId.trim()) {
      setError('Both a job id and a candidate profile id are required.');
      return;
    }
    try {
      await portalPost('/api/portal/employer/agency-submissions', {
        jobId: jobId.trim(),
        candidateId: candidateId.trim(),
        notes: notes.trim() || null,
      });
      setJobId('');
      setCandidateId('');
      setNotes('');
      await onDone();
    } catch (caught) {
      setError(formatApiError(caught));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Submit a candidate"
        description="The client company is chosen for you from your authorised client links — you cannot name one here."
      />
      <form onSubmit={submit} noValidate className="space-y-4 p-5">
        {error ? <Alert kind="error">{error}</Alert> : null}
        <Field label="Job id" htmlFor="sub-job" hint="The job this candidate is being put forward for.">
          <input
            id="sub-job"
            className={inputClass}
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          />
        </Field>
        <Field
          label="Candidate profile id"
          htmlFor="sub-cand"
          hint="The candidate must have consented to be shared with employers."
        >
          <input
            id="sub-cand"
            className={inputClass}
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
          />
        </Field>
        <Field label="Why this candidate (optional)" htmlFor="sub-notes">
          <textarea
            id="sub-notes"
            rows={2}
            className={inputClass}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>
            Submit
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** The append-only stage-by-stage history of one submission. */
function SubmissionHistory({ submissionId }: { submissionId: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const history = useAsync(
    () =>
      open
        ? portalGet<{ items: AgencySubmissionEventDTO[] }>(
            `/api/portal/employer/agency-submissions/${submissionId}`
          )
        : Promise.resolve({ items: [] as AgencySubmissionEventDTO[] }),
    [submissionId, open]
  );
  const entries = open ? (history.data?.items ?? []) : [];

  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-xs text-accent-soft hover:text-accent"
      >
        {open ? 'Hide history' : 'Show history'}
      </button>
      {open ? (
        history.loading ? (
          <p className="mt-2 text-xs text-slate-500">Loading history…</p>
        ) : history.error ? (
          <p className="mt-2 text-xs text-red-300">{history.error}</p>
        ) : entries.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No history recorded.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="text-xs text-slate-400">
                <span className="text-slate-300">
                  {entry.fromStatus
                    ? `${entry.fromStatus.replace(/_/g, ' ')} → ${entry.toStatus.replace(/_/g, ' ')}`
                    : entry.toStatus.replace(/_/g, ' ')}
                </span>{' '}
                · {formatDateTime(entry.createdAt)}
                {entry.note ? ` — ${entry.note}` : ''}
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}