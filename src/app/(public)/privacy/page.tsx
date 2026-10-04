import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Ravelyth Talent handles account, profile, application, and payment information.",
};

export default async function PrivacyPage() {
  const settings = await getSiteSettings();
  return (
    <PolicyPage
      title="Privacy policy"
      intro={`This policy describes how ${settings.brandName} handles personal information when you use the job portal. It should be read with the applicable terms and any service-specific notices.`}
      override={settings.privacyPolicyOverride}
      settings={settings}
      sections={[
        {
          heading: "Information we process",
          body: "Depending on how you use the service, information may include account and contact details, candidate profile and resume content, job applications and saved searches, employer and company information, support messages, and billing records. Payment credentials are handled by the payment provider and are not stored as card data by this application.",
        },
        {
          heading: "How information is used",
          body: "Information is used to operate accounts, provide job search and recruitment features, deliver notifications and service emails, moderate companies and job listings, process payments, prevent abuse, and respond to support requests.",
        },
        {
          heading: "When information is shared",
          body: "A candidate's application information is shared with the hiring company for the role applied to. Candidate database discovery is available only where the candidate has opted in and the employer is entitled to use that feature. Service providers may process information to support hosting, authentication, payments, or email delivery.",
        },
        {
          heading: "Retention and security",
          body: "Records are retained as needed to operate the service, meet legal and accounting obligations, resolve disputes, and enforce platform policies. We use access controls and reasonable technical and organizational safeguards; no internet service can guarantee absolute security.",
        },
        {
          heading: "Your choices and contact",
          body: "You can update profile information and privacy preferences from your account settings. For privacy requests or questions, contact the service operator using the contact details above. Additional legal rights and response procedures may apply under Indian law.",
        },
      ]}
    />
  );
}
