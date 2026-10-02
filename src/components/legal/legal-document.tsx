import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * The legal document shell.
 *
 * Every legal page uses this so the navigation, the "last updated" line and the
 * prose width are identical across the set. A document that looks different from
 * its neighbours is harder to read carefully, and these are documents people
 * are meant to read.
 *
 * `version` is the same string recorded against a user's consent at the moment
 * they accepted it. That is why it is passed in rather than invented per page:
 * a consent record points at a version, and a document that displayed a
 * different number would be claiming to be something the user did not accept.
 */
export function LegalDocument({
  eyebrow,
  title,
  summary,
  version,
  effectiveFrom,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  version: string;
  effectiveFrom: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <nav aria-label="Legal" className="mb-8 text-sm text-slate-500">
        <Link href="/legal/terms" className="hover:text-accent-soft">
          Terms
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link href="/legal/privacy" className="hover:text-accent-soft">
          Privacy
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link href="/legal/candidate-consent" className="hover:text-accent-soft">
          Candidate consent
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link href="/legal/employer-terms" className="hover:text-accent-soft">
          Employer terms
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link href="/legal/job-posting-policy" className="hover:text-accent-soft">
          Job posting policy
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link href="/legal/cancellation" className="hover:text-accent-soft">
          Cancellation
        </Link>
      </nav>

      <header className="border-b border-line pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-soft">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-slate-300">{summary}</p>
        <p className="mt-4 text-xs text-slate-500">
          Version {version} · effective {effectiveFrom}
        </p>
      </header>

      <div className="prose-invert mt-8 space-y-6 text-sm leading-relaxed text-slate-300">
        {children}
      </div>
    </div>
  );
}

/** A numbered clause. Rendered as a real heading so it can be linked to. */
export function Clause({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-base font-semibold text-ink">
        <span className="mr-2 text-slate-500">{id}</span>
        {heading}
      </h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

/** A bulleted list, for enumerating commitments that are easy to skim. */
export function List({ items }: { items: string[] }): React.ReactElement {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
