import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage, InfoSection } from '@/components/layout/info-page';

export const metadata: Metadata = {
  title: 'Security',
  description: 'How Ravelyth Talent protects candidates, employers, and platform data, and how to report a security issue.',
  alternates: { canonical: '/security' },
};

export default function Page(): React.ReactElement {
  return (
    <InfoPage
      title="Security"
      intro="How this service protects its visitors, and how to report a suspected vulnerability."
    >
      <InfoSection title="Reporting a security issue" id="reporting">
        <p>
          If you find a suspected vulnerability — in the job board, authentication, or anything else — please
          report it through the project’s repository at{' '}
          <a
            href="https://github.com/indiafinance2003-stack/RavelythTalent"
            className="font-medium text-accent hover:text-accent-strong"
            rel="noopener noreferrer"
          >
            github.com/indiafinance2003-stack/RavelythTalent
          </a>{' '}
          using a private security advisory where possible. Include reproduction steps and the affected route. Do
          not test vulnerabilities against accounts or data belonging to other people.
        </p>
        <p>
          Ravelyth Talent is an open, community-maintained project. It holds no certifications and claims none;
          this page describes actual implemented controls.
        </p>
      </InfoSection>
      <InfoSection title="Controls in place" id="controls">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Password storage:</strong> passwords are hashed with Argon2id; plaintext passwords are never
            stored or logged.
          </li>
          <li>
            <strong>Sessions:</strong> cryptographically random session tokens in HttpOnly, SameSite=Lax cookies
            (Secure in production); only a SHA-256 hash of each token is stored server-side; sessions expire
            server-side after seven days.
          </li>
          <li>
            <strong>Database access:</strong> all queries are parameterized through a typed query builder; queries
            run server-side only and credentials never reach the browser.
          </li>
          <li>
            <strong>Input validation:</strong> server-side validation on every endpoint; oversized requests are
            rejected before processing.
          </li>
          <li>
            <strong>Private network protection:</strong> domains and IP targets resolving to private, loopback, or
            link-local ranges are refused, so the tools cannot probe internal networks.
          </li>
          <li>
            <strong>Rate limiting:</strong> per-client rolling limits on public endpoints, with stricter limits on
            login and registration.
          </li>
          <li>
            <strong>Transport headers:</strong> Content-Security-Policy, X-Frame-Options DENY, nosniff, and
            referrer restrictions are set on every response.
          </li>
        </ul>
      </InfoSection>
      <InfoSection title="Known scope limits" id="limits">
        <p>
          Being honest about what is not in place: rate limiting is in-memory (per application instance), so
          multi-instance deployments would need a shared store; there is no distributed DDoS protection beyond
          what the hosting network provides; and no email sending means no email-verified registration. These are
          documented limitations, not hidden weaknesses.
        </p>
      </InfoSection>
      <InfoSection title="Related pages" id="related">
        <p>
          See the{' '}
          <Link href="/privacy" className="font-medium text-accent hover:text-accent-strong">
            privacy policy
          </Link>{' '}
          for how data is handled, and the{' '}
          <Link href="/faq" className="font-medium text-accent hover:text-accent-strong">
            FAQ
          </Link>{' '}
          for operational limits.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
