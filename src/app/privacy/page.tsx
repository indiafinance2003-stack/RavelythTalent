import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/layout/info-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What Ravelyth Talent stores, what it does not store, and how account, resume and application data are handled.',
  alternates: { canonical: '/privacy' },
};

export default function Page(): React.ReactElement {
  return (
    <InfoPage
      title="Privacy policy"
      intro="This page describes what Ravelyth Talent actually does with data. It is intentionally specific: anything not listed here is not collected."
    >
      <InfoSection title="What we collect" id="collect">
        <p>
          When you create an account we store your name, email address, a cryptographic hash of your password
          (Argon2id), the account creation time and the time of your most recent sign-in. Passwords are never
          stored in plaintext and never appear in logs.
        </p>
        <p>
          When you apply to a job we store the application, the resume you attached, and the status history of
          that application. When you build a profile or a resume we store what you entered.
        </p>
      </InfoSection>
      <InfoSection title="Consent" id="consent">
        <p>
          Consent is recorded separately for each purpose — job applications, resume storage, and marketing. You
          can withdraw any one of them later without affecting the others. Marketing is strictly opt-in and is
          never pre-ticked.
        </p>
      </InfoSection>
      <InfoSection title="Who can see your data" id="sharing">
        <p>
          Your resume is private by default. An employer can read a resume only after you have applied to one of
          their roles with it. Recruiters can browse candidate profiles within the entitlement their plan grants,
          and recruitment agencies act on behalf of the client company they are authorised for.
        </p>
      </InfoSection>
      <InfoSection title="Sign-in sessions" id="sessions">
        <p>
          Signing in creates a server-side session: a cryptographically random token is stored in an HttpOnly
          cookie and only a hash of that token is stored server-side. Sessions expire after seven days and expired
          sessions are removed. Signing out invalidates the session server-side and clears the cookie.
        </p>
      </InfoSection>
      <InfoSection title="Cookies" id="cookies">
        <p>
          Ravelyth Talent sets exactly one cookie: the session cookie described above. It contains no personal
          data and is not used for advertising or tracking. Visitors without an account receive no cookies.
        </p>
      </InfoSection>
      <InfoSection title="Rate limiting and abuse prevention" id="rate-limiting">
        <p>
          To keep the service available we apply rate limits per client over rolling windows, with stricter limits
          on login and registration. These counters live in application memory and are not exported to third
          parties.
        </p>
      </InfoSection>
      <InfoSection title="What Ravelyth Talent does not do" id="not">
        <ul className="list-disc space-y-2 pl-5">
          <li>No third-party analytics or advertising scripts.</li>
          <li>No sale or sharing of your data.</li>
          <li>No profiling of visitors or candidates.</li>
          <li>No paid placement of candidates in search results.</li>
        </ul>
      </InfoSection>
    </InfoPage>
  );
}
