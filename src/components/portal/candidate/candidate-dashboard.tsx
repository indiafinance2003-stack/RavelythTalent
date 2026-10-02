'use client';

import Link from 'next/link';
import { useSession } from '@/lib/portal-client/use-session';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { ApplicationDTO, JobSearchResult, ResumeSummary } from '@/lib/portal-client/types';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  completionLabel,
} from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  PageHeader,
} from '@/components/portal/ui';

/**
 * Candidate dashboard.
 *
 * Everything shown comes from real endpoints: profile completion from the
 * profile service, applications from the applications service, recommended jobs
 * from the public search. There is no sample content anywhere on this page.
 */
export function CandidateDashboard(): React.ReactElement {
  const { user } = useSession();

  const profile = useAsync(
    () => portalGet<{ completion: { percentage: number; missing: string[] } }>(
      '/api/portal/candidate/profile'
    ),
    []
  );
  const applications = useAsync(
    () => portalGet<{ items: ApplicationDTO[] }>('/api/portal/candidate/applications'),
    []
  );
  const resumes = useAsync(
    () => portalGet<{ resumes: ResumeSummary[] }>('/api/portal/candidate/resumes'),
    []
  );
  const recommended = useAsync(
    () => portalGet<JobSearchResult>('/api/portal/jobs', { pageSize: 3, sort: 'recent' }),
    []
  );

  const completion = profile.data?.completion;
  const recent = (applications.data?.items ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidate dashboard"
        title={user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Welcome back'}
        description="Track your applications, keep your profile current, and find your next role."
        action={
          <Link
            href="/jobs"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Browse jobs
          </Link>
        }
      />

      {!user?.emailVerified ? (
        <Alert kind="warning">
          Your email address is not verified yet. You need a verified address before you can apply.{' '}
          <Link href="/verify-email" className="underline">
            Verify now
          </Link>
          .
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Profile completion</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {completion ? `${completion.percentage}%` : '—'}
          </p>
          {completion ? (
            <div className="mt-3">
              <Meter value={completion.percentage} max={100} label="Profile completion" />
            </div>
          ) : null}
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Applications</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {applications.loading ? '—' : applications.data?.items.length ?? 0}
          </p>
          <Link href="/candidate/applications" className="mt-2 inline-block text-sm text-accent-soft">
            View all
          </Link>
        </Card>

        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Resumes</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {resumes.loading ? '—' : resumes.data?.resumes.length ?? 0}
          </p>
          <Link href="/candidate/resumes" className="mt-2 inline-block text-sm text-accent-soft">
            Manage resumes
          </Link>
        </Card>
      </div>

      {completion && completion.missing.length > 0 ? (
        <Card>
          <CardHeader
            title="Finish your profile"
            description="Employers see a stronger profile when these are filled in. Completion is calculated by the server from your real data."
          />
          <div className="p-5">
            <ul className="flex flex-wrap gap-2">
              {completion.missing.map((field) => (
                <li key={field}>
                  <Badge tone="bg-amber-500/10 text-amber-300 ring-amber-500/40">
                    {completionLabel(field)}
                  </Badge>
                </li>
              ))}
            </ul>
            <Link
              href="/candidate/profile"
              className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Complete my profile
            </Link>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Recent applications"
          action={
            <Link href="/candidate/applications" className="text-sm text-accent-soft">
              View all
            </Link>
          }
        />
        <div className="p-5">
          {applications.loading ? <LoadingState label="Loading your applications…" /> : null}
          {applications.error ? (
            <ErrorState message={applications.error} onRetry={applications.reload} />
          ) : null}
          {!applications.loading && !applications.error && recent.length === 0 ? (
            <EmptyState
              title="You have not applied to any roles yet"
              description="Once you apply, each application and its status will appear here."
              action={
                <Link
                  href="/jobs"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
                >
                  Find jobs
                </Link>
              }
            />
          ) : null}
          {recent.length > 0 ? (
            <ul className="divide-y divide-line">
              {recent.map((application) => (
                <li key={application.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {application.jobTitle ?? 'Application'}
                    </p>
                    <p className="truncate text-xs text-slate-500">{application.companyName ?? ''}</p>
                  </div>
                  <Badge tone={APPLICATION_STATUS_TONES[application.status]}>
                    {APPLICATION_STATUS_LABELS[application.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Latest openings"
          action={
            <Link href="/jobs" className="text-sm text-accent-soft">
              Browse all
            </Link>
          }
        />
        <div className="p-5">
          {recommended.loading ? <LoadingState label="Loading openings…" /> : null}
          {recommended.error ? (
            <p className="text-sm text-slate-500">Openings are not available right now.</p>
          ) : null}
          {recommended.data && recommended.data.items.length === 0 ? (
            <p className="text-sm text-slate-400">There are no live openings at the moment.</p>
          ) : null}
          {recommended.data && recommended.data.items.length > 0 ? (
            <ul className="divide-y divide-line">
              {recommended.data.items.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="truncate text-sm font-medium text-ink hover:text-accent"
                    >
                      {job.title}
                    </Link>
                    <p className="truncate text-xs text-slate-500">{job.companyName}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
