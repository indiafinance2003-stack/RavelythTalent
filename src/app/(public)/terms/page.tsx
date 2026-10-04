import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Terms for candidates, employers, and other users of Ravelyth Talent.",
};

export default async function TermsPage() {
  const settings = await getSiteSettings();
  return (
    <PolicyPage
      title="Terms of service"
      intro={`These terms apply when you access or use ${settings.brandName}. By using the service, you agree to follow these terms and applicable law.`}
      override={settings.termsOverride}
      settings={settings}
      sections={[
        {
          heading: "Accounts and eligibility",
          body: "Provide accurate account information, keep your credentials confidential, and promptly report suspected unauthorized use. You are responsible for activity under your account. We may restrict access when required to protect users or enforce these terms.",
        },
        {
          heading: "Job seekers",
          body: "Keep profile, resume, and application details accurate and lawful. Applying to a role authorizes the relevant hiring company to review the information submitted for that application. Candidate database visibility is optional and can be changed in profile settings.",
        },
        {
          heading: "Employers and listings",
          body: "Employers must provide accurate company and job details, complete verification when requested, and comply with applicable employment and anti-discrimination laws. Company and job submissions may be moderated and must be approved before publication. Employers are responsible for decisions and communications in their hiring process.",
        },
        {
          heading: "Plans and payments",
          body: "Prices, plan features, applicable taxes, and billing periods are shown before checkout. Payments are processed in INR through Razorpay. Plans are period-based and do not automatically renew; another payment is required to continue after the current period. Any applicable refund terms are described in the Refund and Cancellation Policy and at checkout.",
        },
        {
          heading: "Content and service availability",
          body: "You retain responsibility for content you submit and must have the rights and authority to provide it. Do not upload unlawful, misleading, harmful, or infringing content or attempt to disrupt the service. Features may change or be unavailable during maintenance, subject to applicable law.",
        },
        {
          heading: "Applicable law",
          body: "These terms are intended to be interpreted consistently with applicable laws of India. Mandatory consumer and other statutory rights are not limited by these terms.",
        },
      ]}
    />
  );
}
