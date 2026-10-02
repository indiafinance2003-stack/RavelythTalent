import type { Metadata } from 'next';
import { Clause, LegalDocument, List } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Job posting policy | Ravelyth Talent',
  description:
    'The rules every posting must meet, how approval works, and what happens when a posting breaches them.',
  alternates: { canonical: '/legal/job-posting-policy' },
};

export default function Page(): React.ReactElement {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Job posting policy"
      summary="What a posting must be, what we check before it goes live, and what happens when one does not meet the bar."
      version="v1"
      effectiveFrom="1 October 2024"
    >
      <Clause id="1" heading="Every posting must be a real, open role">
        <p>
          A posting must describe a genuine, currently open position at the company it is attributed
          to. Ravelyth does not allow postings for roles that are not open, that exist only to collect
          applications for another purpose, or that are duplicated to inflate a company&apos;s visibility.
        </p>
      </Clause>

      <Clause id="2" heading="Attribution and client companies">
        <p>
          A posting is published in the name of one company. A recruitment agency posting on behalf of
          a client must be authorised for that client, and the job is shown against the client&apos;s name.
        </p>
        <List
          items={[
            'The agency must not post in a client’s name without an authorisation recorded against it.',
            'Only a Ravelyth administrator can change a company between direct employer and recruitment agency.',
            'Revoking an authorisation stops new postings immediately. Vacancies already published stay live.',
          ]}
        />
        <p>
          This matters to candidates: when a role is attributed to a company, that is the company the
          role is with. We do not permit an agency to post a role under a client’s name to direct
          applications somewhere else.
        </p>
      </Clause>

      <Clause id="3" heading="Approval before publication">
        <p>
          Postings are reviewed before they go live. A posting stays in <em>awaiting approval</em>{' '}
          until a Ravelyth administrator approves it, and becomes visible on the job board only at
          that point. This setting is configurable, but it is on by default and turning it off is a
          deliberate administrative decision.
        </p>
        <p>
          If we reject a posting we give a reason, and the employer can edit and resubmit. Approval is
          a judgement about whether a posting meets this policy; it is not a comment on the employer,
          and a rejected posting does not affect an employer’s verification status.
        </p>
      </Clause>

      <Clause id="4" heading="What a posting must not do">
        <List
          items={[
            'Discriminate on grounds of gender, religion, caste, disability, sexual orientation, age or any other protected characteristic.',
            'Ask for information a posting does not need, such as a photograph, a caste or religion, a date of birth, or a photograph of an identity document.',
            'Request a password, an OTP, a bank account number, or payment of any kind from a candidate as a condition of applying.',
            'Misrepresent the role, its salary, its location, or its working arrangement.',
            'Ask a candidate to send a resume to an email address or messaging app instead of applying through Ravelyth, in a way that circumvents the platform.',
            'Post a role that is actually a scheme to charge applicants, or to sell a product or service by pretending to be a vacancy.',
          ]}
        />
        <p>
          A posting that does any of these is rejected. Where a posting has already been published and
          then breaches this policy, we may remove it, and we may suspend the employer account. We log
          every moderation decision.
        </p>
      </Clause>

      <Clause id="5" heading="Salary">
        <p>
          Salary may be shown publicly or kept private at the employer’s choice. A private salary is
          not a breach of this policy, but the salary band you supply internally must be the band you
          will actually offer; we may ask to see it. We do not permit a posting to advertise a
          substantially higher figure than the one offered to the successful candidate.
        </p>
      </Clause>

      <Clause id="6" heading="Job credits">
        <p>
          Posting consumes a job credit, and credits are granted when a payment is confirmed. Credits
          already granted are not refunded simply because a posting was withdrawn or rejected — see the
          cancellation terms. If a posting is removed by Ravelyth for a policy breach, tell us and we
          will return the credit.
        </p>
      </Clause>

      <Clause id="7" heading="Reporting">
        <p>
          Anyone can report a posting or an application from the job board or from their account. Every
          report is reviewed by a person, and we record the outcome and the reason.
        </p>
      </Clause>
    </LegalDocument>
  );
}
