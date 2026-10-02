import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TALENT_CLIENT_SEGMENTS,
  TALENT_CONTACT_EMAIL,
  TALENT_FOCUS_ROLES,
  TALENT_PUBLIC_BOUNDARIES,
  TALENT_PUBLIC_PROCESS,
} from '@/lib/talent/catalog';

export const metadata: Metadata = {
  title: 'Hire Technology Talent — Ravelyth Talent',
  description:
    'Ravelyth Talent sources, screens and coordinates technology talent for IT services, SaaS, hosting and product companies. No candidate fees. No surprises.',
  alternates: { canonical: '/talent' },
};

export default function TalentLandingPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <section className="text-center">
        <span className="inline-block rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">
          Technology recruitment
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Technology Talent. Faster Hiring.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
          We source, screen and coordinate technology talent for companies that
          need dependable people — from technical support and NOC to Linux
          administration, QA and IT operations — matched against a role you
          actually defined.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/jobs"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
          >
            View open positions
          </Link>
          <Link
            href={`mailto:${TALENT_CONTACT_EMAIL}`}
            className="rounded-md border border-line px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-accent hover:text-accent"
          >
            Share your requirement
          </Link>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          No account needed to apply. We never charge candidates a fee.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-center text-2xl font-semibold text-ink">Who we hire for</h2>
        <ul className="mt-6 flex flex-wrap justify-center gap-2">
          {TALENT_FOCUS_ROLES.map((role) => (
            <li
              key={role}
              className="rounded-full border border-line bg-navy-surface px-4 py-1.5 text-sm text-slate-300"
            >
              {role}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-center text-2xl font-semibold text-ink">How it works for employers</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TALENT_PUBLIC_PROCESS.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line bg-navy-surface p-5">
              <span className="text-sm font-medium text-accent">Step {index + 1}</span>
              <h3 className="mt-1 font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <h3 className="font-semibold text-ink">Companies we typically work with</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {TALENT_CLIENT_SEGMENTS.map((segment) => (
              <li
                key={segment}
                className="rounded-full bg-paper px-3 py-1 text-sm text-slate-400"
              >
                {segment}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-14 rounded-xl border border-line bg-navy-surface p-6">
        <h2 className="text-2xl font-semibold text-ink">We are upfront about boundaries</h2>
        <ul className="mt-4 space-y-2 text-slate-300">
          {TALENT_PUBLIC_BOUNDARIES.map((boundary) => (
            <li key={boundary} className="flex gap-2">
              <span aria-hidden="true" className="text-accent">·</span>
              <span>{boundary}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 text-center">
        <h2 className="text-2xl font-semibold text-ink">Have a role to fill?</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Send us the requirement — role, location, work mode, experience band,
          shift and budget — and we will respond with how we would approach it.
        </p>
        <Link
          href={`mailto:${TALENT_CONTACT_EMAIL}`}
          className="mt-5 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Contact us at {TALENT_CONTACT_EMAIL}
        </Link>
      </section>
    </main>
  );
}