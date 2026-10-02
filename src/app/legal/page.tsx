import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Legal and policy documents | Ravelyth Talent',
  description:
    'Every Ravelyth Talent policy in one place: terms, privacy, candidate consent, employer terms, job posting policy, and cancellation terms.',
  alternates: { canonical: '/legal' },
};

/**
 * The index of legal documents.
 *
 * Grouped by whose terms they are rather than listed alphabetically, because a
 * visitor arrives here looking for the document that governs what they are about
 * to do, not one that starts with a particular letter.
 */
const GROUPS: Array<{ heading: string; description: string; documents: Array<{ href: string; title: string; blurb: string }> }> = [
  {
    heading: 'Applies to everyone',
    description: 'The terms your use of Ravelyth Talent is covered by, whoever you are.',
    documents: [
      {
        href: '/legal/terms',
        title: 'Terms of service',
        blurb: 'Accounts, content, acceptable use, moderation, payments, and liability.',
      },
      {
        href: '/legal/privacy',
        title: 'Privacy policy',
        blurb: 'What we collect, the basis we hold it on, who we share it with, and your rights.',
      },
    ],
  },
  {
    heading: 'If you are a candidate',
    description: 'How your profile, resume and applications are used, and the choices you control.',
    documents: [
      {
        href: '/legal/candidate-consent',
        title: 'Candidate consent',
        blurb: 'Each purpose we ask permission for, and how to withdraw any one of them.',
      },
    ],
  },
  {
    heading: 'If you are hiring',
    description: 'What posting, verification and client authorisation commit you to.',
    documents: [
      {
        href: '/legal/employer-terms',
        title: 'Employer and agency terms',
        blurb: 'Verification, recruitment agency authorisations, and how to use candidate data.',
      },
      {
        href: '/legal/job-posting-policy',
        title: 'Job posting policy',
        blurb: 'What a posting must contain, how approval works, and what gets a posting rejected.',
      },
      {
        href: '/legal/cancellation',
        title: 'Cancellation and refunds',
        blurb: 'When credits are granted, when they cannot be refunded, and when we will refund.',
      },
    ],
  },
];

export default function Page(): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-soft">Legal</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Policies and terms</h1>
        <p className="mt-3 text-slate-300">
          Every Ravelyth Talent document in one place. Each carries its own version and effective
          date, and the version recorded against your consent is the one that applied when you agreed.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {GROUPS.map((group) => (
          <section key={group.heading}>
            <h2 className="text-base font-semibold text-ink">{group.heading}</h2>
            <p className="mt-1 text-sm text-slate-400">{group.description}</p>
            <ul className="mt-4 space-y-3">
              {group.documents.map((document) => (
                <li key={document.href}>
                  <Link
                    href={document.href}
                    className="block rounded-lg border border-line px-4 py-3 transition hover:border-accent/50"
                  >
                    <p className="text-sm font-medium text-ink">{document.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{document.blurb}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
