import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage, InfoSection } from '@/components/layout/info-page';
import { ContactForm } from '@/components/contact/contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Send a message to the Ravelyth Talent team, or report a problem with the platform.',
  alternates: { canonical: '/contact' },
};

export default function Page(): React.ReactElement {
  return (
    <InfoPage
      title="Contact"
      intro="A question, a bug report, or anything else — send us a message and include as much detail as you can."
    >
      <InfoSection title="Send a message" id="form">
        <ContactForm />
        <p className="mt-4 text-xs text-slate-500">
          Messages are held privately for the Ravelyth team only. We never sell or share your contact
          details.
        </p>
      </InfoSection>

      <InfoSection title="Security issues" id="security">
        <p>
          Suspected vulnerabilities or abuse of the service should be reported through the process on the{' '}
          <Link href="/security" className="font-medium text-accent hover:text-accent-strong">
            Security page
          </Link>
          , not the contact form. Please do not describe exploit details in public issue trackers.
        </p>
      </InfoSection>

      <InfoSection title="What to include" id="include">
        <ul className="list-disc space-y-2 pl-5">
          <li>The page you were using and what you were trying to do.</li>
          <li>The job, company, or application involved.</li>
          <li>The timestamp (UTC) of the request.</li>
          <li>A short description of what you expected versus what was shown.</li>
        </ul>
        <p className="mt-2">
          Please never paste passwords, payment details, or anything else you would not want a support team to see
          when requesting help.
        </p>
      </InfoSection>
    </InfoPage>
  );
}