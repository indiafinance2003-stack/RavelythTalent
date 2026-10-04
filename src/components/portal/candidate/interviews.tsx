'use client';

import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { CandidateInterviewDTO } from '@/lib/portal-client/types';
import { formatDateTime } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * The candidate's own interview schedule.
 *
 * This screen is deliberately READ-ONLY, and the API behind it is read-only too:
 * there is no candidate-facing endpoint that reschedules, cancels or records an
 * outcome. A candidate does not get to move an employer's interview — they
 * confirm by turning up, or they tell the employer.
 *
 * It also never shows interviewer notes. The candidate DTO is built by a
 * separate mapping on the server that cannot include the `notes` column at all,
 * so there is nothing here for this screen to accidentally render. What the
 * candidate does see is the location or meeting link, because they need it.
 */
export function CandidateInterviews(): React.ReactElement {
  const interviews = useAsync(
    () => portalGet<{ items: CandidateInterviewDTO[] }>('/api/portal/candidate/interviews'),
    []
  );

  const items = interviews.data?.items ?? [];
  const upcoming = items.filter((interview) => interview.status === 'scheduled');
  const past = items.filter((interview) => interview.status !== 'scheduled');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Interviews"
        title="Your interviews"
        description="Everything an employer has arranged with you, and how each one turned out."
      />

      {interviews.loading ? <LoadingState label="Loading your interviews…" /> : null}
      {interviews.error ? (
        <ErrorState message={interviews.error} onRetry={interviews.reload} />
      ) : null}

      {!interviews.loading && !interviews.error && items.length === 0 ? (
        <EmptyState
          title="No interviews yet"
          description="When an employer schedules an interview with you it appears here with the time and joining details."
        />
      ) : null}

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader title="Upcoming" />
          <ul className="divide-y divide-line">
            {upcoming.map((interview) => (
              <li key={interview.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{interview.jobTitle}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Round {interview.round} · {formatDateTime(interview.scheduledAt)} ·{' '}
                      {interview.durationMinutes} minutes
                    </p>
                    {interview.locationOrLink ? (
                      <p className="mt-2 break-words text-sm text-slate-300">
                        {interview.locationOrLink}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone="bg-sky-500/10 text-sky-300 ring-sky-500/40">Scheduled</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card>
          <CardHeader title="Earlier interviews" />
          <ul className="divide-y divide-line">
            {past.map((interview) => (
              <li key={interview.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{interview.jobTitle}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Round {interview.round} · {formatDateTime(interview.scheduledAt)}
                  </p>
                </div>
                <Badge
                  tone={
                    interview.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 ring-slate-700'
                  }
                >
                  {interview.status.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Alert kind="info">
        If a time no longer works, contact the employer directly — interviews are arranged by them,
        so only they can move one. Changes made here are not possible by design.
      </Alert>
    </div>
  );
}