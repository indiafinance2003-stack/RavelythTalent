'use client';

import { useState } from 'react';
import { portalGet, portalPost, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import type {
  EmployerApplication,
  InterviewDTO,
  InterviewHistoryEntry,
  InterviewMode,
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
 * The company's interview schedule.
 *
 * AN INTERVIEW BELONGS TO AN APPLICATION, not to a person, so scheduling here
 * takes an application id and nothing else. The candidate, the job, the company
 * and the round number are all resolved server-side from that application, which
 * is what makes it impossible to arrange an interview on somebody else's
 * candidate or outside this company.
 *
 * Every state change — scheduled, rescheduled, completed, cancelled, no-show — is
 * appended to a history the server keeps. This screen reloads from that history
 * rather than patching a local copy, so what is displayed is always what was
 * actually recorded.
 */
export function InterviewsPage(): React.ReactElement {
  const interviews = useAsync(
    () => portalGet<{ items: InterviewDTO[] }>('/api/portal/employer/interviews'),
    []
  );
  const applications = useAsync(
    () => portalGet<{ items: EmployerApplication[] }>('/api/portal/employer/applications'),
    []
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);

  const items = interviews.data?.items ?? [];
  const pipeline = applications.data?.items ?? [];

  async function schedule(input: {
    applicationId: string;
    mode: InterviewMode;
    scheduledAt: string;
    locationOrLink: string;
  }): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy('schedule');
    try {
      await portalPost('/api/portal/employer/interviews', {
        applicationId: input.applicationId,
        mode: input.mode,
        // The form holds a datetime-local string; the API takes an ISO date.
        scheduledAt: new Date(input.scheduledAt).toISOString(),
        locationOrLink: input.locationOrLink.trim() || null,
      });
      setOpenForm(false);
      await interviews.reload();
      setMessage('Interview scheduled. The candidate can now see the details.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Applies one change to an interview and re-reads the list.
   *
   * `body` is either `{ action: 'reschedule', … }` or `{ action: 'status', … }`,
   * matching the discriminated union the API validates. Reloading afterwards
   * rather than mutating a local copy means the screen shows the server's record
   * of what happened, including anything it declined to allow.
   */
  async function record(interview: InterviewDTO, body: unknown): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(interview.id);
    try {
      await portalSend('PATCH', `/api/portal/employer/interviews/${interview.id}`, body);
      await interviews.reload();
      setMessage('Interview updated.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Hiring"
        title="Interviews"
        description="Every interview your company has arranged, and the outcome of each one."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpenForm((open) => !open)}
          >
            {openForm ? 'Close' : 'Schedule an interview'}
          </Button>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {openForm ? (
        <ScheduleForm
          applications={pipeline}
          busy={busy === 'schedule'}
          onSchedule={schedule}
          onCancel={() => setOpenForm(false)}
        />
      ) : null}

      {interviews.loading ? <LoadingState label="Loading your interview schedule…" /> : null}
      {interviews.error ? <ErrorState message={interviews.error} onRetry={interviews.reload} /> : null}

      {!interviews.loading && !interviews.error && items.length === 0 ? (
        <EmptyState
          title="No interviews scheduled yet"
          description="Schedule one from a shortlisted applicant above, or open an application and move it to Interview."
        />
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              busy={busy === interview.id}
              onReschedule={(body) => record(interview, body)}
              onStatus={(body) => record(interview, body)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
const MODES: { value: InterviewMode; label: string }[] = [
  { value: 'video', label: 'Video call' },
  { value: 'phone', label: 'Phone' },
  { value: 'onsite', label: 'On site' },
];

/**
 * The scheduling form.
 *
 * It offers only candidates who have actually applied to this company. The list
 * comes from the applications endpoint, so there is no free-text candidate field
 * that could name somebody who never applied — and the server re-derives the
 * candidate and company from the chosen application regardless.
 */
function ScheduleForm({
  applications,
  busy,
  onSchedule,
  onCancel,
}: {
  applications: EmployerApplication[];
  busy: boolean;
  onSchedule: (input: {
    applicationId: string;
    mode: InterviewMode;
    scheduledAt: string;
    locationOrLink: string;
  }) => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  const [applicationId, setApplicationId] = useState('');
  const [mode, setMode] = useState<InterviewMode>('video');
  const [scheduledAt, setScheduledAt] = useState('');
  const [locationOrLink, setLocationOrLink] = useState('');

  return (
    <Card>
      <CardHeader
        title="Schedule an interview"
        description="The candidate, job and round are derived from the application you choose."
      />
      <form
        noValidate
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void onSchedule({ applicationId, mode, scheduledAt, locationOrLink });
        }}
      >
        <Field
          label="Application"
          htmlFor="iv-app"
          hint="Only candidates who applied to your company are listed."
        >
          <select
            id="iv-app"
            className={inputClass}
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          >
            <option value="">Choose an applicant…</option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.candidateName ?? 'Candidate'} — {application.jobTitle ?? 'a role'}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date and time" htmlFor="iv-when">
            <input
              id="iv-when"
              type="datetime-local"
              className={inputClass}
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </Field>
          <Field label="How" htmlFor="iv-mode">
            <select
              id="iv-mode"
              className={inputClass}
              value={mode}
              onChange={(event) => setMode(event.target.value as InterviewMode)}
            >
              {MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Meeting link, phone number or address"
          htmlFor="iv-where"
          hint="Shared with the candidate. Never put anything confidential here."
        >
          <input
            id="iv-where"
            className={inputClass}
            value={locationOrLink}
            onChange={(event) => setLocationOrLink(event.target.value)}
          />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={!applicationId || !scheduledAt}>
            Schedule
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
/** One scheduled interview: its details, its outcome controls and its history. */
function InterviewCard({
  interview,
  busy,
  onReschedule,
  onStatus,
}: {
  interview: InterviewDTO;
  busy: boolean;
  onReschedule: (body: unknown) => Promise<void>;
  onStatus: (body: unknown) => Promise<void>;
}): React.ReactElement {
  const [rescheduling, setRescheduling] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [notes, setNotes] = useState('');

  const settled = interview.status !== 'scheduled';

  return (
    <Card>
      <CardHeader
        title={`${interview.candidateName} — ${interview.jobTitle}`}
        description={`Round ${interview.round} · ${formatDateTime(interview.scheduledAt)} · ${
          MODES.find((option) => option.value === interview.mode)?.label ?? interview.mode
        } · ${interview.durationMinutes} minutes`}
        action={
          <Badge
            tone={
              interview.status === 'scheduled'
                ? 'bg-sky-500/10 text-sky-300 ring-sky-500/40'
                : interview.status === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 ring-slate-700'
            }
          >
            {interview.status.replace(/_/g, ' ')}
          </Badge>
        }
      />
      <div className="space-y-4 p-5">
        {interview.locationOrLink ? (
          <p className="text-sm text-slate-400">{interview.locationOrLink}</p>
        ) : null}
        {interview.notes ? (
          <p className="whitespace-pre-line rounded-lg bg-paper p-3 text-xs leading-relaxed text-slate-400">
            {interview.notes}
          </p>
        ) : null}

        {settled ? (
          <p className="text-xs text-slate-500">
            This interview is marked {interview.status.replace(/_/g, ' ')} and can no longer be
            rescheduled. The record is kept exactly as it happened.
          </p>
        ) : (
          <InterviewActions
            interview={interview}
            busy={busy}
            notes={notes}
            onNotesChange={setNotes}
            rescheduling={rescheduling}
            onToggleReschedule={() => setRescheduling((value) => !value)}
            newTime={newTime}
            onNewTimeChange={setNewTime}
            onReschedule={onReschedule}
            onStatus={onStatus}
          />
        )}

        <InterviewHistory interviewId={interview.id} />
      </div>
    </Card>
  );
}
/**
 * Outcome controls for an interview that has not yet settled.
 *
 * Rescheduling is offered as a move to a new time rather than an edit of the
 * existing row, because the server records it as a history event: "who moved
 * this and when" survives the change.
 */
function InterviewActions({
  interview,
  busy,
  notes,
  onNotesChange,
  rescheduling,
  onToggleReschedule,
  newTime,
  onNewTimeChange,
  onReschedule,
  onStatus,
}: {
  interview: InterviewDTO;
  busy: boolean;
  notes: string;
  onNotesChange: (value: string) => void;
  rescheduling: boolean;
  onToggleReschedule: () => void;
  newTime: string;
  onNewTimeChange: (value: string) => void;
  onReschedule: (body: unknown) => Promise<void>;
  onStatus: (body: unknown) => Promise<void>;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      {rescheduling ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="New date and time" htmlFor={`iv-re-${interview.id}`}>
            <input
              id={`iv-re-${interview.id}`}
              type="datetime-local"
              className={inputClass}
              value={newTime}
              onChange={(event) => onNewTimeChange(event.target.value)}
            />
          </Field>
          <Button
            loading={busy}
            disabled={!newTime}
            onClick={() =>
              void onReschedule({
                action: 'reschedule',
                scheduledAt: new Date(newTime).toISOString(),
                note: notes.trim() || null,
              })
            }
          >
            Reschedule
          </Button>
          <Button variant="ghost" onClick={onToggleReschedule}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onToggleReschedule}>
            Reschedule
          </Button>
          <Button
            size="sm"
            loading={busy}
            onClick={() =>
              void onStatus({
                action: 'status',
                status: 'completed',
                notes: notes.trim() || null,
              })
            }
          >
            Mark completed
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            onClick={() =>
              void onStatus({
                action: 'status',
                status: 'cancelled',
                notes: notes.trim() || null,
              })
            }
          >
            Cancel interview
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() =>
              void onStatus({
                action: 'status',
                status: 'no_show',
                notes: notes.trim() || null,
              })
            }
          >
            No-show
          </Button>
        </div>
      )}
      <Field
        label="Interviewer notes"
        htmlFor={`iv-note-${interview.id}`}
        hint="Private to your company. The candidate never sees these."
      >
        <textarea
          id={`iv-note-${interview.id}`}
          rows={2}
          className={inputClass}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </Field>
    </div>
  );
}

/** The append-only log of everything that happened to one interview. */
function InterviewHistory({ interviewId }: { interviewId: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  // Only fetched once expanded: the history is append-only detail nobody needs
  // for a list view, and fetching it per row would be N requests for nothing.
  const history = useAsync(
    () =>
      open
        ? portalGet<{ items: InterviewHistoryEntry[] }>(
            `/api/portal/employer/interviews/${interviewId}`
          )
        : Promise.resolve({ items: [] as InterviewHistoryEntry[] }),
    [interviewId, open]
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
                <span className="text-slate-300">{entry.eventType.replace(/_/g, ' ')}</span>
                {entry.scheduledAt ? ` · moved to ${formatDateTime(entry.scheduledAt)}` : ''} ·{' '}
                {formatDateTime(entry.createdAt)}
                {entry.note ? ` — ${entry.note}` : ''}
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}