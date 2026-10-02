import Link from 'next/link';
import type { Metadata } from 'next';
import { currentPortalUser } from '@/lib/portal/auth-context';
import { JobSearchHero } from '@/components/portal/jobs/job-search-hero';
import { FeaturedJobs } from '@/components/portal/jobs/featured-jobs';

export const metadata: Metadata = {
  title: 'Ravelyth Talent — Connecting Great People with Great Opportunities',
  description:
    'Find jobs, hire talent and build careers on Ravelyth Talent. A professional job marketplace for candidates, employers and recruitment agencies.',
  alternates: { canonical: '/' },
};

const pillars = [
  {
    href: '/jobs',
    title: 'Find Jobs',
    body: 'Search every live opening on the portal by keyword, location, experience, salary, work mode and skills. Filters run in the database, so what you see is what is actually published.',
    cta: 'Browse jobs',
  },
  {
    href: '/employer/jobs/new',
    title: 'Hire Talent',
    body: 'Buy job credits, post a vacancy, and manage the whole pipeline. Employers never publish directly: every posting is reviewed first, so candidates only see checked listings.',
    cta: 'Post a job',
  },
  {
    href: '/candidate/profile',
    title: 'Build Careers',
    body: 'Maintain one profile that stays current, build resumes with real version history, set job alerts, and track every application through to a decision.',
    cta: 'Create a profile',
  },
];

const audiences = [
  {
    href: '/register?type=candidate',
    title: 'For candidates',
    body: 'Apply to roles, upload resumes, and follow every application. You consent to each purpose separately and can withdraw any of them later without touching the others.',
  },
  {
    href: '/register?type=employer',
    title: 'For employers',
    body: 'Hire directly. Buy job credits, post vacancies, shortlist applicants and move them through interview to offer.',
  },
  {
    href: '/register?type=employer&agency=1',
    title: 'For recruitment agencies',
    body: 'Staffing firms can be authorised to publish for client companies. Your own brand appears on the posting while the vacancy is attributed to the client you represent.',
  },
];

/**
 * The Ravelyth Talent homepage.
 *
 * Signed-in users are sent to the dashboard that matches their role rather than
 * being shown marketing they do not need. The session lookup is best-effort:
 * with no database configured the page must still render for a logged-out
 * visitor instead of failing.
 */
export default async function HomePage(): Promise<React.ReactElement> {
  let signedInRole: string | null = null;
  try {
    const user = await currentPortalUser();
    signedInRole = user?.role ?? null;
  } catch {
    signedInRole = null;
  }

  const dashboardHref =
    signedInRole === 'admin'
      ? '/admin'
      : signedInRole === 'employer'
        ? '/employer'
        : signedInRole === 'candidate'
          ? '/candidate'
          : null;

  return (
    <div>
      <section className="bg-tech-grid border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
          <div className="max-w-3xl">
            <p className="inline-block rounded-full border border-line bg-navy-surface px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent-soft">
              Ravelyth Talent
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
              Connecting Great People with Great Opportunities
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              A professional job marketplace where employers post checked vacancies, recruitment agencies
              publish on behalf of their clients, and candidates apply with a profile they actually control.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {dashboardHref ? (
                <Link
                  href={dashboardHref}
                  className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
                >
                  Go to your dashboard
                </Link>
              ) : (
                <Link
                  href="/jobs"
                  className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
                >
                  Find Jobs
                </Link>
              )}
              {!dashboardHref ? (
                <>
                  <Link
                    href="/register"
                    className="rounded-md border border-line px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-accent hover:text-accent"
                  >
                    Create an account
                  </Link>
                  <Link
                    href="/login"
                    className="rounded-md px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-accent"
                  >
                    Sign in
                  </Link>
                </>
              ) : null}
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Find Jobs &middot; Hire Talent &middot; Build Careers
            </p>
          </div>

          <div className="mt-10 max-w-3xl">
            <JobSearchHero />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => (
            <div key={pillar.title} className="rounded-xl border border-line bg-navy-surface p-6">
              <h2 className="text-lg font-semibold text-ink">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{pillar.body}</p>
              <Link
                href={pillar.href}
                className="mt-4 inline-block text-sm font-medium text-accent-soft hover:text-accent"
              >
                {pillar.cta} &rarr;
              </Link>
            </div>
          ))}
        </div>
      </section>

      <FeaturedJobs />

      <section className="border-y border-line bg-paper">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Who Ravelyth Talent is for</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audiences.map((audience) => (
              <div key={audience.title} className="rounded-xl border border-line bg-navy-surface p-5">
                <h3 className="font-semibold text-ink">{audience.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{audience.body}</p>
                <Link
                  href={audience.href}
                  className="mt-4 inline-block text-sm font-medium text-accent-soft hover:text-accent"
                >
                  Get started &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">How the platform works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-4">
          {[
            {
              title: 'Accounts and verification',
              body: 'Every account starts with an email verification link. Applying to a job requires a verified address, so the pipeline is not full of unreachable people.',
            },
            {
              title: 'Postings are reviewed',
              body: 'An employer submits a draft for approval and consumes a job credit. Only an administrator can publish it, so candidates browse checked vacancies.',
            },
            {
              title: 'You control your data',
              body: 'Consent is purpose-specific and withdrawable. Resumes are private by default and an employer can only read one after you have applied with it.',
            },
            {
              title: 'Every decision is recorded',
              body: 'Application and job status changes are written to an audit trail with an actor and a timestamp, so neither side has to take the other on trust.',
            },
          ].map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line bg-navy-surface p-5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-navy-surface">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Ready when you are</h2>
          <p className="mt-3 text-muted">
            Create an account as a candidate, an employer, or a recruitment agency. You can change what you
            are looking for at any time.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Create an account
            </Link>
            <Link
              href="/jobs"
              className="rounded-md border border-line px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-accent hover:text-accent"
            >
              Browse open jobs
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
