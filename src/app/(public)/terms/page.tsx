import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
import { defaultTermsSections } from "@/lib/legal/default-policies";
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
      sections={defaultTermsSections(settings)}
    />
  );
}
