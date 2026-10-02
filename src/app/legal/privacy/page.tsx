import type { Metadata } from 'next';
import { Clause, LegalDocument, List } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Privacy policy | Ravelyth Talent',
  description:
    'What personal data Ravelyth Talent collects, why we collect it, who we share it with, and how to exercise your rights.',
  alternates: { canonical: '/legal/privacy' },
};

export default function Page(): React.ReactElement {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy policy"
      summary="What we collect, why we hold it, who sees it, and how to get it back or have it deleted."
      version="v1"
      effectiveFrom="1 October 2024"
    >
      <Clause id="1" heading="Who this is about">
        <p>
          This policy covers candidates, employers, recruitment agencies and their authorised users.
          Employers and agencies are separately bound as controllers of the candidate data they receive;
          this policy describes what Ravelyth itself does with that data.
        </p>
      </Clause>

      <Clause id="2" heading="What we collect">
        <p>
          <strong>Account data.</strong> Your name, email address, password (stored only as a
          one-way hash), and your account role and status.
        </p>
        <p>
          <strong>Candidate data.</strong> What you enter on your profile: headline, summary, work
          history, education, skills, languages, projects, certifications and achievements, salary
          expectations, notice period, and links you choose to add. Plus the resumes you upload, the
          cover letters you write, and the applications, saved jobs and alerts you create.
        </p>
        <p>
          <strong>Employer data.</strong> Company details, the authorised users attached to a company,
          agency client authorisations, job postings, applications, and job credit purchases.
        </p>
        <p>
          <strong>Technical data.</strong> Your IP address, recorded on sign-in and on the actions that
          change someone else’s data — verification, suspension, credit grants — so we can investigate
          an incident.
        </p>
      </Clause>

      <Clause id="3" heading="Why we hold it, and on what basis">
        <List
          items={[
            'To operate your account and let you sign in — necessary to provide the service.',
            'To store your resumes and show them to an employer you applied to — your consent, per purpose, which you can withdraw.',
            'To show your profile to employers only where you have made it visible — your consent.',
            'To send service emails such as application updates — necessary to provide the service.',
            'To send marketing email, and to contact you about roles we think match — your consent, and optional.',
            'To keep the platform secure, investigate abuse and meet legal obligations — our legitimate interests and legal duties.',
            'To process payments for job credits and premium — necessary to provide a paid service.',
          ]}
        />
        <p>
          Each consent is a separate, dated record with the version of the notice you accepted, and each
          can be withdrawn on its own. See the{' '}
          <a href="/legal/candidate-consent" className="text-accent-soft underline">
            candidate consent notice
          </a>
          .
        </p>
      </Clause>

      <Clause id="4" heading="Who we share it with">
        <List
          items={[
            'An employer you have applied to, who can see your profile, resume and cover letter for that application.',
            'Other Ravelyth employers, only to the extent you have made your profile visible to them.',
            'Your payment provider, to take payment and confirm it came back to us.',
            'Our email provider, to send you service and — where you consented — marketing email.',
            'Nobody else. We do not sell personal data, and we do not share it for anyone else’s advertising.',
          ]}
        />
      </Clause>

      <Clause id="5" heading="Employer handling of candidate data">
        <p>
          When an employer opens an application, they receive your name, resume, cover letter and
          profile details. They may use it to assess you for the role you applied to, and for nothing
          else. Every resume download is logged, with who downloaded it and when, so misuse is
          traceable.
        </p>
      </Clause>

      <Clause id="6" heading="How long we keep it">
        <p>
          We keep your account and its data while your account is open. If you close your account we
          keep what we need to meet legal and tax obligations, and we delete or anonymise the rest.
          Consent records and audit logs are kept for the period required to show what was agreed and
          who did what, even after an account closes.
        </p>
        <p>
          If you withdraw consent for recruitment services, ask us to remove your profile from
          recruiter search and we will do so.
        </p>
      </Clause>

      <Clause id="7" heading="Security">
        <p>
          Passwords are hashed and never stored or logged in plain text. Sessions are revocable, and
          changing your password signs out every other device. Access to candidate data by employers is
          limited to their own company’s applications, and administrative actions are recorded in an
          audit log. No system is perfectly secure, and we will tell you and the relevant authority if
          a breach affects your data.
        </p>
      </Clause>

      <Clause id="8" heading="Your rights">
        <p>
          You can see and correct your profile, withdraw any consent, and export your data from your
          account. You can also ask us to delete your account, to correct inaccurate data, to restrict
          processing, or to provide a copy of what we hold. Email your request and we will deal with it;
          we may ask you to confirm your identity first.
        </p>
        <p>
          Where processing rests on consent, withdrawing it stops that processing. Where it rests on
          our legitimate interests, you can object and we will explain how we handled it.
        </p>
      </Clause>

      <Clause id="9" heading="Changes to this policy">
        <p>
          If we change what we collect or why, we will tell you. Where a change concerns a purpose you
          consented to, we will ask for consent again rather than treat your existing consent as
          covering the new use.
        </p>
      </Clause>
    </LegalDocument>
  );
}

