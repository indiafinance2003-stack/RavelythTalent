'use client';

import Link from 'next/link';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { ApplicationDTO } from '@/lib/portal-client/types';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  formatDate,
  formatRelative,
} from '@/lib/portal-client/format';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * The candidate's applications and their status.
 *
 * Every status shown comes from the application record, and the tone is
 * accompanied by its label so state is never conveyed by colour alone.
 */
export function CandidateApplications(): React.ReactElement {
  const applications = useAsync(
    () => portalGet<{ items: ApplicationDTO[] }>('/api/portal/candidate/applications'),
    []
  );

  const items = applications.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Applications"
        title="Your applications"
        description="Every role you have applied to, and where each application stands right now."
        action={
          <Link
            href="/jobs"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Find more jobs
          </Link>
        }
      />

      {applications.loading ? <LoadingState label="Loading your applications…" /> : null}
      {applications.error ? (
        <ErrorState message={applications.error} onRetry={applications.reload} />
      ) : null}

      {!applications.loading && !applications.error && items.length === 0 ? (
        <EmptyState
          title="You have not applied to any roles yet"
          description="When you apply for a job it appears here with its current status."
          action={
            <Link
              href="/jobs"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Browse jobs
            </Link>
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
                      href={`/jobs/${application.jobId}`}
                      className="text-sm font-semibold text-ink hover:text-accent"
                    >
                      {application.jobTitle ?? 'Application'}
                    </Link>
                    <p className="text-xs text-slate-500">{application.companyName ?? ''}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Applied {formatRelative(application.appliedAt)} · {formatDate(application.appliedAt)}
                    </p>
                  </div>
                  <Badge tone={APPLICATION_STATUS_TONES[application.status]}>
                    {APPLICATION_STATUS_LABELS[application.status]}
                  </Badge>
                </div>
                {application.coverLetter ? (
                  <p className="mt-3 whitespace-pre-line rounded-lg bg-paper p-3 text-xs leading-relaxed text-slate-400">
                    {application.coverLetter}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
