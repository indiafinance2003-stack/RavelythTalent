import Link from 'next/link';
import { RavelythMark } from '@/components/ui/logo';
import { configuredSocialLinks } from '@/lib/social';

const columns: Array<{
  title: string;
  links: Array<{ label: string; href: string }>;
}> = [
  {
    title: 'DNS Tools',
    links: [
      { label: 'DNS Lookup', href: '/dns/lookup' },
      { label: 'DNS Health', href: '/dns/analyze' },
      { label: 'SPF Checker', href: '/dns/spf' },
      { label: 'DKIM Checker', href: '/dns/dkim' },
      { label: 'DMARC Checker', href: '/dns/dmarc' },
    ],
  },
  {
    title: 'More Tools',
    links: [
      { label: 'DNSSEC Records', href: '/dns/analyze' },
      { label: 'PTR Lookup', href: '/dns/ptr' },
      { label: 'Resolver Comparison', href: '/dns/resolvers' },
      { label: 'Email Header Analyzer', href: '/email/analyze' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Knowledge Base', href: '/docs' },
      { label: 'DNS Guides', href: '/guides/dns' },
      { label: 'Email Authentication Guides', href: '/guides/email' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Managed Services', href: '/services' },
      { label: 'Request Support', href: '/support/request' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Security', href: '/security' },
    ],
  },
  {
    // The Ravelyth Talent policies, kept separate from the DNS tools legal
    // pages above because they are different documents with different terms.
    title: 'Ravelyth Talent',
    links: [
      { label: 'All policies', href: '/legal' },
      { label: 'Terms of service', href: '/legal/terms' },
      { label: 'Privacy policy', href: '/legal/privacy' },
      { label: 'Candidate consent', href: '/legal/candidate-consent' },
      { label: 'Employer terms', href: '/legal/employer-terms' },
      { label: 'Job posting policy', href: '/legal/job-posting-policy' },
      { label: 'Cancellation and refunds', href: '/legal/cancellation' },
    ],
  },
];

export function SiteFooter({ authenticated = false }: { authenticated?: boolean }): React.ReactElement {
  // Resolved from configuration on the server. Empty until real accounts are set.
  const social = configuredSocialLinks();
  const year = new Date().getFullYear();

  const accountColumn = authenticated
    ? [
        { label: 'Your Account', href: '/account' },
        { label: 'Support Tickets', href: '/account/support' },
        { label: 'Notifications', href: '/account/notifications' },
        { label: 'Billing', href: '/account/billing' },
        { label: 'Public Tools', href: '/dns/lookup' },
      ]
    : [
        { label: 'Sign In', href: '/login' },
        { label: 'Create Account', href: '/register' },
      ];

  return (
    <footer className="border-t border-line bg-navy-surface">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_0.8fr]">
          <div>
            <div className="flex items-center gap-2">
              <RavelythMark size={28} />
              <span className="text-lg font-semibold tracking-tight text-ink">Ravelyth</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-slate-400">
              Free DNS and email diagnostics for developers, administrators, businesses and domain owners. Real
              lookups, structured findings, and no unexplained scores.
            </p>
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold text-ink">{column.title}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link href={link.href} className="text-sm text-slate-400 hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <nav aria-label="Account">
            <h2 className="text-sm font-semibold text-ink">Account</h2>
            <ul className="mt-3 space-y-2">
              {accountColumn.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-slate-400 hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Ravelyth. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy" className="hover:text-accent">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-accent">
              Terms
            </Link>
            <Link href="/security" className="hover:text-accent">
              Security
            </Link>
            {/* Only channels an operator has configured and that pass validation
                are rendered. An unconfigured network contributes no link at all,
                rather than a placeholder pointing at an account that may not
                exist. See src/lib/social.ts. */}
            {social.map((link) => (
              <a
                key={link.network}
                href={link.href}
                // External profile: open in a new tab, and noopener/noreferrer
                // so the destination cannot reach back through window.opener.
                target="_blank"
                rel="noopener noreferrer me"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
