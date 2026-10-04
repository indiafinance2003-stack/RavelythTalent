import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage, InfoSection } from '@/components/layout/info-page';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply to using Ravelyth Talent.',
  alternates: { canonical: '/terms' },
};

export default function Page(): React.ReactElement {
  return (
    <InfoPage
      title="Terms of service"
      intro="These terms govern use of Ravelyth Talent. By using the site you agree to them."
    >
      <InfoSection title="The service" id="service">
        <p>
          Ravelyth Talent connects candidates with employers and recruitment agencies. It publishes job listings,
          accepts applications, and provides the tools employers and candidates use to manage them. The service is
          offered as-is, without any uptime commitment or service-level agreement.
        </p>
      </InfoSection>
      <InfoSection title="Acceptable use" id="use">
        <ul className="list-disc space-y-2 pl-5">
          <li>Do not post misleading, discriminatory, or unlawful job listings, and do not impersonate another employer.</li>
          <li>Do not scrape, harvest, or resell candidate data, and do not contact candidates outside the platform for your own purposes.</li>
          <li>Do not attempt to bypass rate limits, overload the service, or automate abusive volumes of requests.</li>
          <li>Do not attempt to access other users&apos; accounts or private data.</li>
          <li>Do not submit content you do not have the right to submit, including another person&apos;s personal data.</li>
        </ul>
        <p>
          Access may be rate limited or refused if these rules are violated, including by IP-based request throttling.
        </p>
      </InfoSection>
      <InfoSection title="Accounts" id="accounts">
        <p>
          You are responsible for keeping your password confidential and for the activity that happens under your
          account. Accounts may be suspended if used to violate these terms. You can end your session at any time by
          signing out.
        </p>
      </InfoSection>
      <InfoSection title="Payments and subscriptions" id="payments">
        <p>
          Employer plans and job credits are billed in advance. A subscription or invoice appears in your portal only
          after a real payment record exists. Cancellation and refund terms are set out in our{' '}
          <Link href="/legal/cancellation" className="font-medium text-accent hover:text-accent-strong">
            cancellation and refunds policy
          </Link>
          .
        </p>
      </InfoSection>
      <InfoSection title="No warranty" id="warranty">
        <p>
          Information on this site, including job listings and employer details, is provided by third parties.
          Ravelyth Talent makes no warranty as to its completeness or fitness for any particular purpose. Verify
          details independently before making a hiring or employment decision.
        </p>
      </InfoSection>
      <InfoSection title="Limitation of liability" id="liability">
        <p>
          To the maximum extent permitted by law, Ravelyth Talent is not liable for any damages arising from use
          of, or inability to use, the service — including decisions made on the basis of information published
          on it.
        </p>
      </InfoSection>
      <InfoSection title="Changes" id="changes">
        <p>
          These terms may be updated as the service evolves. Material changes will be reflected on this page with
          an updated description. Continued use after changes constitutes acceptance.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
