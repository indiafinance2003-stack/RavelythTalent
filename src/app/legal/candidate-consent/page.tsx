import type { Metadata } from 'next';
import { Clause, LegalDocument, List } from '@/components/legal/legal-document';

export const metadata: Metadata = {
  title: 'Candidate consent | Ravelyth Talent',
  description:
    'The specific purposes Ravelyth Talent asks a candidate to consent to, and how to withdraw each one.',
  alternates: { canonical: '/legal/candidate-consent' },
};

export default function Page(): React.ReactElement {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Candidate consent"
      summary="What we ask permission for, one purpose at a time. Each consent is recorded separately with the version of this page you accepted, and each can be withdrawn on its own."
      version="v1"
      effectiveFrom="1 October 2024"
    >
      <p>
        Ravelyth Talent records consent as a separate, dated record per purpose rather than as one
        blanket acceptance. That is what lets you withdraw one purpose without losing the others, and
        what lets us show you exactly what you agreed to and when. The record includes the version of
        this page, the date and time, and your IP address.
      </p>

      <Clause id="1" heading="Purposes we ask about">
        <p>These are the only purposes for which we ask, and each is a separate decision:</p>
        <List
          items={[
            'Account creation — to create and operate your account, and to let you sign in.',
            'Job applications — to submit applications on your behalf when you ask us to.',
            'Resume storage — to store the resumes you upload so you can attach them to applications.',
            'Sharing with employers — to make your profile, resume and application visible to an employer you have applied to.',
            'Ravelyth recruitment services — to contact you about roles we think match your profile.',
            'Marketing email — to send you news about Ravelyth Talent and relevant opportunities.',
          ]}
        />
        <p>
          Marketing consent is never pre-ticked. If you do not choose it, everything else on this list
          still works: you can search jobs, apply, and be reached by an employer you applied to.
        </p>
      </Clause>

      <Clause id="2" heading="What withdrawing means">
        <p>
          You can withdraw any consent from your account settings. Withdrawing stops the activity from
          that point onwards — it does not delete what we already collected or undo an application you
          have already submitted, and it does not cancel your account.
        </p>
        <p>
          Withdrawing <em>sharing with employers</em> means employers can no longer open your profile
          and resume through a new application. Withdrawing <em>Ravelyth recruitment services</em>{' '}
          means we will stop proactively contacting you about matching roles. You can still apply to
          anything you find yourself.
        </p>
        <p>
          Withdrawing <em>job applications</em> or <em>resume storage</em> stops you from submitting
          new applications or uploading resumes, because neither is possible without that processing.
          We will ask you to delete your account instead if you want those removed as well.
        </p>
      </Clause>

      <Clause id="3" heading="Required versus optional">
        <p>
          Account creation, job applications and resume storage are required to use the service as a
          candidate. Sharing with employers is required for an employer to see an application at all.
          Ravelyth recruitment services and marketing email are optional, and declining them changes
          nothing about what you can do.
        </p>
      </Clause>

      <Clause id="4" heading="Automated decisions">
        <p>
          Job search ranks and filters results using the criteria you set and the filters you choose.
          Ravelyth does not use automated scoring to decide which candidates an employer sees, and no
          application is rejected automatically. Where an account is suspended, a person makes that
          decision and it is recorded in our audit log with a reason.
        </p>
      </Clause>

      <Clause id="5" heading="Changes to this notice">
        <p>
          If we change what we ask permission for, we record a new consent for the affected purpose
          rather than treating the old one as still valid. Your existing records keep the version you
          actually accepted, so you can always see the terms that applied at the time.
        </p>
      </Clause>
    </LegalDocument>
  );
}
