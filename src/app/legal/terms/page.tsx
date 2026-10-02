import type { Metadata } from 'next';
import { Clause, LegalDocument, List } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Terms of service | Ravelyth Talent',
  description:
    'The terms covering use of Ravelyth Talent, for candidates, employers and recruitment agencies.',
  alternates: { canonical: '/legal/terms' },
};

export default function Page(): React.ReactElement {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of service"
      summary="The terms that cover everyone using Ravelyth Talent. More specific terms for candidates and employers sit alongside these and take precedence where they say so."
      version="v1"
      effectiveFrom="1 October 2024"
    >
      <Clause id="1" heading="What Ravelyth Talent is">
        <p>
          Ravelyth Talent is a job platform. It lets candidates search and apply for vacancies, lets
          employers and recruitment agencies post vacancies, and manages the applications between
          them. We introduce the parties; we are not a party to any employment relationship that
          results.
        </p>
        <p>
          Ravelyth is not an employment agency for candidates and does not guarantee that any role
          will lead to an interview, an offer or a job. We do not endorse employers, and the presence
          of a posting is not a statement that the employer is a good place to work.
        </p>
      </Clause>

      <Clause id="2" heading="Accounts">
        <p>
          You need an account to apply, post, or manage candidates. Give accurate information, keep
          your password to yourself, and tell us if you think someone else has used your account.
          You are responsible for what happens under your account.
        </p>
        <p>
          One person may hold one account. Creating additional accounts to work around posting limits
          or credit limits is a breach of these terms.
        </p>
      </Clause>

      <Clause id="3" heading="Email verification">
        <p>
          We verify the email address you sign up with, and some actions — including submitting an
          application — may require a verified address. Verification exists to stop applications and
          accounts being created from throwaway addresses. You can request a new verification link at
          any time.
        </p>
      </Clause>

      <Clause id="4" heading="Content you submit">
        <p>
          You keep ownership of what you upload. You give Ravelyth a licence to host, store, display
          and show that content to the people the service is designed to show it to — for a resume,
          that means the employer you applied to.
        </p>
        <p>
          You confirm you have the right to submit what you submit. Do not upload a resume that is
          really someone else’s, and do not upload anything unlawful, discriminatory or offensive. We may
          remove content that breaches this.
        </p>
      </Clause>

      <Clause id="5" heading="Acceptable use">
        <p>You must not use Ravelyth Talent to:</p>
        <List
          items={[
            'Post or apply for something unlawful, fraudulent, or discriminatory.',
            'Scrape, copy, or bulk-download candidate or job data.',
            'Attempt to access another account, or probe the service for vulnerabilities without permission.',
            'Upload malware, or interfere with the service’s operation.',
            'Misrepresent who you are or which company you represent.',
            'Resell access, or share your account with someone else.',
          ]}
        />
      </Clause>

      <Clause id="6" heading="Moderation and suspension">
        <p>
          We review postings, applications and reports, and we may suspend or close an account that
          breaches these terms. Where we suspend an account we record a reason. If you believe a
          decision is wrong, report it or contact us and we will look again.
        </p>
      </Clause>

      <Clause id="7" heading="Payments">
        <p>
          Paid features are delivered only after the payment provider confirms the payment to our
          servers. We never activate a paid feature on the strength of a claim that a payment
          succeeded, and neither should you expect anyone at Ravelyth to be able to.
        </p>
        <p>
          Prices are set by us and shown before you pay. Refunds, cancellations and credit expiry are
          set out in the{' '}
          <a href="/legal/cancellation" className="text-accent-soft underline">
            cancellation terms
          </a>
          .
        </p>
      </Clause>

      <Clause id="8" heading="Availability">
        <p>
          We aim to keep Ravelyth Talent available, but we do not guarantee uninterrupted service. We
          may change or withdraw features. Where a feature is withdrawn, we will tell you, and we will
          handle credits already paid for it under the cancellation terms.
        </p>
      </Clause>

      <Clause id="9" heading="Liability">
        <p>
          Ravelyth Talent is provided as-is. To the extent the law allows, we are not liable for a
          loss arising from a vacancy, an application, an employer’s conduct, or a candidate’s
          decision to apply or not to apply. Nothing here limits liability that cannot lawfully be
          limited, including for fraud.
        </p>
      </Clause>

      <Clause id="10" heading="Changes">
        <p>
          We may update these terms. The version and effective date at the top of this page always
          applies to your use from that date. Where a change affects something you have actively
          consented to, we will ask again rather than assume your old consent still covers it.
        </p>
      </Clause>
    </LegalDocument>
  );
}
