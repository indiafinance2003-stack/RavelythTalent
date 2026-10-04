import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage, InfoSection } from '@/components/layout/info-page';

export const metadata: Metadata = {
  title: 'About',
  description:
    'About Ravelyth Talent, the recruitment platform connecting great people with great opportunities.',
  alternates: { canonical: '/about' },
};

export default function Page(): React.ReactElement {
  return (
    <InfoPage
      title="About Ravelyth Talent"
      intro="Ravelyth Talent is a professional job marketplace. Connecting great people with great opportunities — right people, better opportunities, stronger tomorrow."
    >
      <InfoSection title="What we do" id="what">
        <p>
          Ravelyth Talent connects candidates with employers and recruitment agencies. Candidates maintain one
          profile, build resumes, and apply to live vacancies. Employers and agencies publish roles, review
          applicants, shortlist, and move people through interviews to offer.
        </p>
      </InfoSection>
      <InfoSection title="How it works" id="how">
        <p>
          Every job is reviewed before it is published, so candidates only browse checked listings rather than
          unverified postings. Employers consume a job credit to submit a vacancy, and applications, status changes
          and moderation decisions are recorded in an audit trail with an actor and a timestamp.
        </p>
      </InfoSection>
      <InfoSection title="Accounts and data" id="accounts">
        <p>
          Creating an account is free. Passwords are stored only as Argon2id hashes, sessions are server-side with
          an HttpOnly cookie, and consent is recorded separately for each purpose so it can be withdrawn without
          affecting the others. Resumes stay private by default, and an employer can only read one after you have
          applied with it.
        </p>
      </InfoSection>
      <InfoSection title="Learn more" id="more">
        <p>
          Browse the{' '}
          <Link href="/jobs" className="font-medium text-accent hover:text-accent-strong">
            live job board
          </Link>
          , read the{' '}
          <Link href="/pricing" className="font-medium text-accent hover:text-accent-strong">
            pricing
          </Link>{' '}
          for employers, or see the{' '}
          <Link href="/faq" className="font-medium text-accent hover:text-accent-strong">
            FAQ
          </Link>
          .
        </p>
      </InfoSection>
    </InfoPage>
  );
}
