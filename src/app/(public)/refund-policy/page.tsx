import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
import { defaultRefundSections } from "@/lib/legal/default-policies";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Refund and cancellation policy",
  description: "Information about plan periods, cancellations, and payment queries.",
};

export default async function RefundPolicyPage() {
  const settings = await getSiteSettings();
  return (
    <PolicyPage
      title="Refund and cancellation policy"
      intro={`This policy describes billing periods and how to raise a payment or service concern for ${settings.brandName}.`}
      override={settings.refundPolicyOverride}
      settings={settings}
      sections={defaultRefundSections(settings)}
    />
  );
}
