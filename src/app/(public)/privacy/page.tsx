import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
import { defaultPrivacySections } from "@/lib/legal/default-policies";
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
      sections={defaultPrivacySections(settings)}
    />
  );
}
