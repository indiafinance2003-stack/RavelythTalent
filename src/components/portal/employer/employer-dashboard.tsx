'use client';

import Link from 'next/link';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type {
  AgencyClientsResponse,
  CreditBalance,
  EmployerApplication,
  EmployerCompany,
  EmployerJob,
} from '@/lib/portal-client/types';
import {
  EMPLOYMENT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  VERIFICATION_LABELS,
  formatRelative,
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
 * Employer and agency dashboard.
 *
 * Everything is scoped to the caller's own company by the API. The account kind
 * is READ from the server and changes what is offered: only a recruitment agency
 * is shown the client-authorisation section and the "post for a client" action,
 * so a direct employer is never offered a control it cannot use.
 */
export function EmployerDashboard(): React.ReactElement {
  const company = useAsync(
    () => portalGet<{ company: EmployerCompany | null }>('/api/portal/employer/company'),
    []
  );
  const jobs = useAsync(
    () => portalGet<{ items: EmployerJob[]; credits: CreditBalance }>('/api/portal/employer/jobs'),
    []
  );
  const applications = useAsync(
    () => portalGet<{ items: EmployerApplication[] }>('/api/portal/employer/applications'),
    []
  );
  const clients = useAsync(
    () => portalGet<AgencyClientsResponse>('/api/portal/employer/company/clients'),
    []
  );

  const info = company.data?.company ?? null;
  const isAgency = info?.companyType === 'recruitment_agency';
  const jobItems = jobs.data?.items ?? [];
  const credits = jobs.data?.credits;

  const counts = {
    live: jobItems.filter((job) => job.status === 'published').length,
    pending: jobItems.filter((job) => job.status === 'pending_approval').length,
    draft: jobItems.filter((job) => job.status === 'draft').length,
    needsChanges: jobItems.filter((job) => job.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAgency ? 'Recruitment agency' : 'Employer'}
        title={info?.name ?? 'Your company'}
        description={
          isAgency
            ? 'Post vacancies for the client companies you are authorised to represent.'
            : 'Post vacancies, review applicants and manage your hiring pipeline.'
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

      {info && info.verificationStatus !== 'verified' ? (
        <Alert kind="warning">
          Your company is{' '}
          <strong>{VERIFICATION_LABELS[info.verificationStatus]?.toLowerCase() ?? info.verificationStatus}</strong>
          . Only a Ravelyth administrator can verify a company, and some actions stay limited until then.
          {info.verificationNotes ? ` Note from the team: ${info.verificationNotes}` : ''}
        </Alert>
      ) : null}

      {isAgency ? (
        <Alert kind="info">
          You are a <strong>recruitment agency</strong>. Jobs you post belong to your company for
          billing and moderation, and can name a client company you are authorised to represent.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Live jobs</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{jobs.loading ? '—' : counts.live}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Awaiting review</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{jobs.loading ? '—' : counts.pending}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Drafts</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{jobs.loading ? '—' : counts.draft}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Applications</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {applications.loading ? '—' : applications.data?.items.length ?? 0}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Job credits"
          description="One credit is consumed each time a job is submitted for review."
          action={
            <Link href="/employer/packages" className="text-sm text-accent-soft">
              Buy credits
            </Link>
          }
        />
        <div className="p-5">
          {jobs.loading ? <LoadingState label="Loading your balance…" /> : null}
          {jobs.error ? <ErrorState message={jobs.error} onRetry={jobs.reload} /> : null}
          {credits ? (
            credits.available > 0 ? (
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Available</span>
                  <span className="font-medium text-ink">{credits.available} credits</span>
                </div>
                <div className="mt-2">
                  <Meter
                    value={credits.available}
                    max={Math.max(credits.total, 1)}
                    label="Credits available"
                    tone={credits.available > 0 ? 'bg-emerald-500' : 'bg-red-500'}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {credits.used} used of {credits.total} purchased
                  {credits.earliestExpiry ? ` · earliest expiry ${new Date(credits.earliestExpiry).toLocaleDateString('en-IN')}` : ''}
                </p>
              </div>
            ) : (
              <EmptyState
                title="You have no job credits"
                description="Buy a package to submit your next vacancy for review."
                action={
                  <Link
                    href="/employer/packages"
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
                  >
                    See packages
                  </Link>
                }
              />
            )
          ) : null}
        </div>
      </Card>

      {isAgency ? (
        <Card>
          <CardHeader
            title="Authorised client companies"
            description="You may only post for a client listed here."
            action={
              <Link href="/employer/company/clients" className="text-sm text-accent-soft">
                Manage clients
              </Link>
            }
          />
          <div className="p-5">
            {clients.loading ? <LoadingState label="Loading your clients…" /> : null}
            {clients.data && clients.data.clients.length === 0 ? (
              <EmptyState
                title="No client companies are authorised yet"
                description="Add a client company to be able to post vacancies on its behalf."
              />
            ) : null}
            {clients.data && clients.data.clients.length > 0 ? (
              <ul className="divide-y divide-line">
                {clients.data.clients.map((client) => (
                  <li key={client.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="text-sm text-ink">{client.name}</span>
                    <Badge
                      tone={
                        client.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 ring-slate-700'
                      }
                    >
                      {client.status === 'active'
                        ? client.verified
                          ? 'Authorised · verified'
                          : 'Authorised'
                        : 'Revoked'}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Recent jobs"
          action={
            <Link href="/employer/jobs" className="text-sm text-accent-soft">
              View all
            </Link>
          }
        />
        <div className="p-5">
          {jobs.loading ? <LoadingState label="Loading your jobs…" /> : null}
          {jobs.error ? <ErrorState message={jobs.error} onRetry={jobs.reload} /> : null}
          {!jobs.loading && !jobs.error && jobItems.length === 0 ? (
            <EmptyState
              title="You have not posted a job yet"
              description="Buy a credit, then save a draft and submit it for review."
              action={
                <Link
                  href="/employer/jobs/new"
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
                >
                  Post your first job
                </Link>
              }
            />
          ) : null}
          {jobItems.slice(0, 5).map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/employer/jobs/${job.id}`}
                  className="text-sm font-medium text-ink hover:text-accent"
                >
                  {job.title}
                </Link>
                <p className="text-xs text-slate-500">
                  {EMPLOYMENT_TYPE_LABELS[job.employmentType as 'full_time'] ?? job.employmentType} ·
                  created {formatRelative(job.createdAt)}
                  {job.postedForCompanyId ? ' · posted for a client' : ''}
                </p>
              </div>
              <Badge tone={JOB_STATUS_TONES[job.status as keyof typeof JOB_STATUS_TONES]}>
                {JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS] ?? job.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Recent applications"
          action={
            <Link href="/employer/applications" className="text-sm text-accent-soft">
              View all
            </Link>
          }
        />
        <div className="p-5">
          {applications.loading ? <LoadingState label="Loading applications…" /> : null}
          {applications.error ? (
            <ErrorState message={applications.error} onRetry={applications.reload} />
          ) : null}
          {!applications.loading && !applications.error && (applications.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400">No applications yet.</p>
          ) : null}
          {(applications.data?.items ?? []).slice(0, 5).map((application) => (
            <div
              key={application.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/employer/applications/${application.id}`}
                  className="text-sm font-medium text-ink hover:text-accent"
                >
                  {application.candidateName ?? 'Candidate'}
                </Link>
                <p className="text-xs text-slate-500">applied for {application.jobTitle ?? 'a role'}</p>
              </div>
              <Badge>{application.status.replace(/_/g, ' ')}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
