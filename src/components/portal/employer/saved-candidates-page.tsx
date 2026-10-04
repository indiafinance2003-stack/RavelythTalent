'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalDelete, portalGet, portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import type { SavedCandidateDTO } from '@/lib/portal-client/types';
import { formatDate } from '@/lib/portal-client/format';
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
 * The company shortlist.
 *
 * A saved candidate is the employer's own bookmark. It is NOT an application, it
 * notifies nobody, and it changes nothing the candidate can see: someone already
 * on the shortlist has exactly the same candidate-side view as someone who is
 * not. This screen says so, because "shortlisted" is a word that implies the
 * other person knows.
 *
 * The `saved_candidates` capability is enforced by the server. A plan without it
 * gets a 403 here, and this screen shows that message rather than an empty list
 * that would look like a company with no candidates.
 */
export function SavedCandidatesPage(): React.ReactElement {
  const saved = useAsync(
    () => portalGet<{ items: SavedCandidateDTO[] }>('/api/portal/employer/saved-candidates'),
    []
  );

  const [candidateId, setCandidateId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = saved.data?.items ?? [];

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!candidateId.trim()) {
      setError('Enter the candidate profile id you want to shortlist.');
      return;
    }
    setBusy('save');
    try {
      await portalPost('/api/portal/employer/saved-candidates', {
        candidateId: candidateId.trim(),
        notes: notes.trim() || null,
      });
      setCandidateId('');
      setNotes('');
      await saved.reload();
      setMessage('Candidate added to your shortlist.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: SavedCandidateDTO): Promise<void> {
    if (!window.confirm(`Remove ${row.fullName} from your shortlist?`)) return;
    setBusy(row.id);
    setError(null);
    setMessage(null);
    try {
      const result = await portalDelete<{ removed: boolean }>('/api/portal/employer/saved-candidates', {
        candidateId: row.candidateId,
      });
      await saved.reload();
      setMessage(
        result.removed
          ? `${row.fullName} removed from your shortlist.`
          : 'That candidate was already off the shortlist.'
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }
return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shortlist"
        title="Saved candidates"
        description="Candidates your team is keeping an eye on, with your private notes about each one."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {saved.loading ? <LoadingState label="Loading your shortlist…" /> : null}
      {saved.error ? <ErrorState message={saved.error} onRetry={saved.reload} /> : null}

      {!saved.loading && !saved.error && items.length === 0 ? (
        <EmptyState
          title="Your shortlist is empty"
          description="Save a candidate from an application, or add one below using their candidate profile id."
        />
      ) : null}

      <Card>
        <CardHeader
          title="Add a candidate"
          description="Paste the candidate profile id from their profile or application URL."
        />
        <form onSubmit={save} noValidate className="space-y-4 p-5">
          <Field label="Candidate profile id" htmlFor="sc-id" hint="The UUID of the candidate profile.">
            <input
              id="sc-id"
              className={inputClass}
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Field
            label="Private note (optional)"
            htmlFor="sc-notes"
            hint="Only your company can read this. The candidate never sees it."
          >
            <textarea
              id="sc-notes"
              rows={2}
              className={inputClass}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={busy === 'save'}>
            Save to shortlist
          </Button>
        </form>
      </Card>

      {items.length > 0 ? (
        <Card>
          <CardHeader title={`${items.length} saved`} />
          <ul className="divide-y divide-line">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{row.fullName}</p>
                    {row.openToWork ? (
                      <Badge tone="bg-emerald-500/10 text-emerald-300 ring-emerald-500/40">
                        Open to work
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.headline ??
                      [row.currentJobTitle, row.currentCompany].filter(Boolean).join(' at ')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.location ? `${row.location} · ` : ''}saved {formatDate(row.savedAt)}
                  </p>
                  {row.notes ? (
                    <p className="mt-2 whitespace-pre-line rounded-lg bg-paper p-3 text-xs leading-relaxed text-slate-400">
                      {row.notes}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === row.id}
                  onClick={() => void remove(row)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Alert kind="info">
        Saving a candidate is a private note to your own team. It does not send them anything, does
        not create an application, and does not grant you access to their resume — you can only open
        a resume for a candidate who has actually applied to one of your jobs.{' '}
        <Link href="/employer/applications" className="underline">
          See your applications
        </Link>
        .
      </Alert>
    </div>
  );
}