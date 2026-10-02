import Link from 'next/link';
import type { Metadata } from 'next';
import { RavelythLogo } from '@/components/ui/logo';

export const metadata: Metadata = {
  title: 'Free DNS & Email Diagnostic Tools — Ravelyth',
  description:
    'Free DNS and email diagnostic tools: DNS lookup, SPF, DKIM, DMARC, PTR, resolver comparison and email header analysis.',
  alternates: { canonical: '/tools' },
};

/**
 * The DNS/email tools product now lives at /tools.
 *
 * It was previously the root. The root is the Ravelyth Talent job portal, so
 * the tools keep their own address rather than being deleted or hidden.
 */
export default function ToolsLandingPage(): React.ReactElement {
  const tools = [
    {
      href: '/dns/lookup',
      title: 'DNS Lookup',
      body: 'Query A, AAAA, CNAME, MX, NS, TXT, SOA, SRV and CAA records with a clear record table plus the raw response.',
    },
    {
      href: '/dns/analyze',
      title: 'DNS Health',
      body: 'Inspect published records, nameservers, SPF, DMARC and DNSSEC-related data with structured findings.',
    },
    {
      href: '/dns/spf',
      title: 'SPF Checker',
      body: 'Parse v=spf1 mechanisms and modifiers, review include chains and flag common configuration problems.',
    },
    {
      href: '/dns/dkim',
      title: 'DKIM Checker',
      body: 'Look up a selector and inspect the published DKIM public key record.',
    },
    {
      href: '/dns/dmarc',
      title: 'DMARC Checker',
      body: 'Read the published _dmarc policy, reporting tags and alignment settings for the domain.',
    },
    {
      href: '/dns/ptr',
      title: 'PTR Lookup',
      body: 'Reverse-lookup public IPv4 and IPv6 addresses. Private and loopback targets are rejected.',
    },
    {
      href: '/dns/resolvers',
      title: 'Resolver Comparison',
      body: 'Compare answers from selected public resolvers side by side.',
    },
    {
      href: '/email/analyze',
      title: 'Email Header Analyzer',
      body: 'Paste complete raw headers to inspect Received hops and reported authentication results.',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-14">
      <section className="max-w-3xl">
        <RavelythLogo />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Free DNS &amp; email diagnostic tools
        </h1>
        <p className="mt-3 text-lg text-muted">
          Eight focused tools, each built around a single job: resolve the live evidence and explain what it
          means. Real lookups, structured findings, no unexplained scores.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dns/lookup"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Run a DNS lookup
          </Link>
          <Link
            href="/"
            className="rounded-md border border-line px-5 py-2.5 text-sm font-medium text-slate-300 hover:border-accent hover:text-accent"
          >
            Ravelyth Talent job portal
          </Link>
        </div>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group flex flex-col rounded-xl border border-line bg-navy-surface p-5 transition hover:border-accent"
          >
            <h2 className="text-base font-semibold text-ink group-hover:text-accent">{tool.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{tool.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
