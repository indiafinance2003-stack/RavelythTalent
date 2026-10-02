'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalGet, portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { useSession } from '@/lib/portal-client/use-session';
import type { PublicCompanyProfile, PublicJobDetail } from '@/lib/portal-client/types';
import {
  EMPLOYMENT_TYPE_LABELS,
  WORK_MODE_LABELS,
  formatDate,
  formatExperienceBand,
  formatRelative,
  formatSalaryBand,
} from '@/lib/portal-client/format';
import { Alert, Badge, Button, Card, CardHeader, LoadingState, ErrorState } from '@/components/portal/ui';
import { SaveJobButton } from '@/components/portal/jobs/save-job-button';

/**
 * Public job detail and the apply action.
 *
 * Applying goes to the real endpoint, which enforces verified email, prior
 * `job_application` consent, the published/deadline state and duplicate
 * prevention. The UI surfaces those refusals verbatim instead of optimistically
 * showing "applied".
 */
export function JobDetail({ jobId }: { jobId: string }): React.ReactElement {
  const { status, user } = useSession();
  const job = useAsync(() => portalGet<PublicJobDetail>(`/api/portal/jobs/${jobId}`), [jobId]);
  const company = useAsync(
    () =>
      job.data
        ? portalGet<PublicCompanyProfile>(`/api/portal/companies/${job.data.companyId}`)
        : Promise.resolve(null),
    [job.data?.companyId ?? '']
  );

  const [coverLetter, setCoverLetter] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  if (job.loading) return <LoadingState label="Loading this role…" />;
  if (job.error) return <ErrorState message={job.error} onRetry={job.reload} />;
  if (!job.data) return <ErrorState message="This role is no longer available." />;

  const data = job.data;
  const experience = formatExperienceBand(data.experienceMinYears, data.experienceMaxYears);
  const deadlinePassed =
    data.applicationDeadline !== null && new Date(data.applicationDeadline).getTime() < Date.now();

  async function apply(): Promise<void> {
    setApplying(true);
    setApplyError(null);
    try {
      await portalPost('/api/portal/candidate/applications', {
        jobId: data.id,
        coverLetter: coverLetter.trim() ? coverLetter.trim() : null,
      });
      // Only reached when the server actually created the application.
      setApplied(true);
    } catch (error) {
      setApplyError(formatApiError(error));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <article className="space-y-6">
        <header>
          <Link href="/jobs" className="text-sm text-slate-400 hover:text-accent">
            &larr; Back to all jobs
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {data.title}
          </h1>
          <p className="mt-1 text-slate-400">
            {data.companyName}
            {data.department ? ` · ${data.department}` : ''}
          </p>

          <ul className="mt-4 flex flex-wrap gap-2">
            <li>
              <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">
                {EMPLOYMENT_TYPE_LABELS[data.employmentType] ?? data.employmentType}
              </Badge>
            </li>
            <li>
              <Badge>{WORK_MODE_LABELS[data.workMode] ?? data.workMode}</Badge>
            </li>
            {data.location ? <li><Badge>{data.location}</Badge></li> : null}
            {experience ? <li><Badge>{experience}</Badge></li> : null}
            {data.openings > 1 ? <li><Badge>{data.openings} openings</Badge></li> : null}
          </ul>

          {data.publishedAt ? (
            <p className="mt-3 text-xs text-slate-500">Posted {formatRelative(data.publishedAt)}</p>
          ) : null}
        </header>

        <Section title="About this role">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
            {data.description}
          </p>
        </Section>

        {data.responsibilities.length > 0 ? (
          <Section title="What you will do">
            <BulletList items={data.responsibilities} />
          </Section>
        ) : null}

        {data.requirements.length > 0 ? (
          <Section title="What we are looking for">
            <BulletList items={data.requirements} />
          </Section>
        ) : null}

        {data.benefits.length > 0 ? (
          <Section title="What we offer">
            <BulletList items={data.benefits} />
          </Section>
        ) : null}

        {data.educationRequirements ? (
          <Section title="Education">
            <p className="text-sm text-slate-300">{data.educationRequirements}</p>
          </Section>
        ) : null}

        {data.skills.length > 0 ? (
          <Section title="Skills">
            <ul className="flex flex-wrap gap-2">
              {data.skills.map((skill) => (
                <li key={skill}>
                  <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">{skill}</Badge>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </article>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title="Apply for this role" />
          <div className="space-y-4 p-5">
            <p className="text-sm font-medium text-slate-300">
              {formatSalaryBand(data.salaryMinMinor, data.salaryMaxMinor, data.salaryPublic)}
            </p>

            {data.applicationDeadline ? (
              <p className="text-xs text-slate-500">
                Applications close {formatDate(data.applicationDeadline)}
              </p>
            ) : null}

            {applied ? (
              <Alert kind="success">
                Your application has been recorded. You can follow its progress under{' '}
                <Link href="/candidate/applications" className="underline">
                  My applications
                </Link>
                .
              </Alert>
            ) : null}

            {applyError ? <Alert kind="error">{applyError}</Alert> : null}

            {status === 'loading' ? (
              <LoadingState label="Checking your account…" />
            ) : status === 'anonymous' ? (
              <>
                <p className="text-sm text-slate-400">
                  Sign in as a candidate to apply. You will need a verified email address.
                </p>
                <Link
                  href="/login"
                  className="block rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-strong"
                >
                  Sign in to apply
                </Link>
              </>
            ) : user?.role !== 'candidate' ? (
              <Alert kind="info">
                Only candidate accounts can apply. You are signed in as{' '}
                {user?.role === 'employer' ? 'an employer' : user?.role ?? 'another account type'}.
              </Alert>
            ) : deadlinePassed ? (
              <Alert kind="warning">
                The application deadline for this role has passed.
              </Alert>
            ) : (
              <>
                <label htmlFor="cover-letter" className="mb-1 block text-sm font-medium text-slate-300">
                  Cover letter (optional)
                </label>
                <textarea
                  id="cover-letter"
                  rows={5}
                  className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-accent focus:outline-none"
                  value={coverLetter}
                  onChange={(event) => setCoverLetter(event.target.value)}
                  placeholder="Why this role, and what you would bring to it."
                />
                {!user.emailVerified ? (
                  <Alert kind="warning">
                    Verify your email address before applying.{' '}
                    <Link href="/candidate/verify" className="underline">
                      Send a new link
                    </Link>
                    .
                  </Alert>
                ) : null}
                <Button onClick={apply} loading={applying} disabled={!user.emailVerified} className="w-full">
                  Submit application
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Save this role" />
          <div className="space-y-2 p-5">
            <p className="text-sm text-slate-400">
              Saved roles stay in your account so you can come back to them, and you can set an alert
              for new openings like this one.
            </p>
            <SaveJobButton jobId={data.id} title={data.title} />
            {status === 'authenticated' && user?.role === 'candidate' ? (
              <Link href="/candidate/saved-jobs" className="block text-sm text-accent-soft underline">
                View your saved roles
              </Link>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="About the company" />
          <div className="space-y-3 p-5 text-sm">
            {company.loading ? <LoadingState label="Loading company…" /> : null}
            {company.error ? (
              <p className="text-sm text-slate-500">Company details are not available right now.</p>
            ) : null}
            {company.data ? (
              <>
                <p className="font-medium text-ink">{company.data.name}</p>
                {company.data.verificationStatus === 'verified' ? (
                  <Badge tone="bg-emerald-500/10 text-emerald-300 ring-emerald-500/40">Verified</Badge>
                ) : (
                  <Badge>Verification pending</Badge>
                )}
                <dl className="space-y-1 text-slate-400">
                  {company.data.industry ? (
                    <div><dt className="inline text-slate-500">Industry: </dt><dd className="inline">{company.data.industry}</dd></div>
                  ) : null}
                  {company.data.companySize ? (
                    <div><dt className="inline text-slate-500">Size: </dt><dd className="inline">{company.data.companySize}</dd></div>
                  ) : null}
                  {company.data.location ? (
                    <div><dt className="inline text-slate-500">Location: </dt><dd className="inline">{company.data.location}</dd></div>
                  ) : null}
                </dl>
                {company.data.description ? (
                  <p className="leading-relaxed text-slate-400">{company.data.description}</p>
                ) : null}
                <p className="text-xs text-slate-500">
                  {company.data.openJobs} open{' '}
                  {company.data.openJobs === 1 ? 'role' : 'roles'} on Ravelyth Talent.
                </p>
              </>
            ) : null}
          </div>
        </Card>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }): React.ReactElement {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item.slice(0, 24)}-${index}`} className="flex gap-2 text-sm leading-relaxed text-slate-300">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
