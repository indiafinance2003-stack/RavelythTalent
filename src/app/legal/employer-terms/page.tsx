import type { Metadata } from 'next';
import { Clause, LegalDocument, List } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Employer terms | Ravelyth Talent',
  description:
    'The terms an employer or recruitment agency accepts when posting on Ravelyth Talent, including verification, credit, and client authorisation.',
  alternates: { canonical: '/legal/employer-terms' },
};

export default function Page(): React.ReactElement {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Employer and agency terms"
      summary="What an employer or recruitment agency agrees to when they post a vacancy, buy job credits, or post on a client's behalf."
      version="v1"
      effectiveFrom="1 October 2024"
    >
      <Clause id="1" heading="Who can post">
        <p>
          An employer account belongs to a company, and several authorised users can belong to one
          company so that a vacancy is never dependent on one person keeping their login. A
          recruitment agency is a company of a different kind: it posts vacancies attributed to client
          companies it has been authorised for.
        </p>
        <p>
          Whether a company is a direct employer or a recruitment agency is decided by a Ravelyth
          administrator, never by the company itself. This is deliberate: if an employer could
          reclassify itself as an agency it could post vacancies in the names of other companies.
        </p>
      </Clause>

      <Clause id="2" heading="Verification">
        <p>
          A new company starts unverified. Verification is a manual decision by Ravelyth, and it is the
          only way a company becomes verified. An employer cannot mark itself verified, and unverified
          companies have posting limits.
        </p>
        <p>
          Give us accurate information about the company and an address we can verify it at. We may
          suspend verification if the information turns out to be inaccurate, and we log every
          verification decision with the administrator who made it.
        </p>
      </Clause>

      <Clause id="3" heading="Client authorisation">
        <p>
          An agency may only post for a client it has explicitly authorised. Authorisation is recorded
          against your account and appears in the audit log, so it is always clear which user granted
          which client access.
        </p>
        <p>
          An authorisation permits posting only. It does not create a login or any dashboard access
          for the client, and it does not transfer the client’s own account. Revoking it stops new
          postings immediately; vacancies already published remain live.
        </p>
      </Clause>

      <Clause id="4" heading="Posting and approval">
        <p>
          Postings are subject to the{' '}
          <a href="/legal/job-posting-policy" className="text-accent-soft underline">
            job posting policy
          </a>
          , which forms part of these terms. Postings are reviewed before publication, and a rejection
          comes with a reason you can act on.
        </p>
        <p>
          When approval is switched off administratively, a posting becomes visible as soon as it is
          submitted. You are still responsible for every posting you submit under either setting.
        </p>
      </Clause>

      <Clause id="5" heading="Job credits">
        <p>
          Posting consumes a job credit from your company’s balance. Credits are granted when a
          payment is confirmed, expire after the validity period shown on the package, and are used
          oldest first. You can see every credit you have been granted and spent in your credit history.
        </p>
        <p>
          Credits are not refundable once spent on a live posting. The full position, including when we
          do refund, is in the{' '}
          <a href="/legal/cancellation" className="text-accent-soft underline">
            cancellation terms
          </a>
          .
        </p>
      </Clause>

      <Clause id="6" heading="Your responsibilities">
        <List
          items={[
            'Only post roles you are authorised to offer, at the company they are attributed to.',
            'Keep company details accurate and tell us promptly if they change.',
            'Tell candidates the truth about the role, including its salary band and location.',
            'Handle candidate data you are given — name, resume, application, notes — lawfully and only for the recruitment you are doing.',
            'Do not ask a candidate for money, or for a password, OTP or bank details, at any stage.',
            'Withdraw a posting once the role is filled or closed.',
          ]}
        />
      </Clause>

      <Clause id="7" heading="Candidature privacy">
        <p>
          When you open an application you receive the candidate’s profile, resume and cover letter.
          You may use that information to assess the candidate for the role they applied to, and for
          no other purpose. You may not copy it, store it beyond your recruitment process, or use it to
          approach the candidate about a different role they did not apply for.
        </p>
        <p>
          Every time a resume is downloaded it is logged against your account, with who downloaded it
          and when.
        </p>
      </Clause>

      <Clause id="8" heading="Suspension and termination">
        <p>
          We may suspend or close an employer account that breaches these terms or the job posting
          policy, that posts misleading vacancies, or that discriminates against candidates.
          Suspension ends access immediately and is recorded with a reason. Where the breach concerns
          money, we may also decline to refund, as set out in the cancellation terms.
        </p>
      </Clause>
    </LegalDocument>
  );
}
