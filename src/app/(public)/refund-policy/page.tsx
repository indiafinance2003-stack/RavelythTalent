import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
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
      sections={[
        {
          heading: "Plan periods and cancellation",
          body: "Candidate and employer plans are activated for the monthly or yearly period selected at checkout. Plans do not automatically renew or charge a saved payment method. No cancellation action is needed to stop a future renewal; a fresh order is required to continue after expiry. Access to paid features continues through the active paid period unless restricted for a policy or legal reason.",
        },
        {
          heading: "Refund requests",
          body: "Refund eligibility depends on applicable law, the specific service purchased, the status of activation or delivery, and any offer terms shown at checkout. Contact support promptly with the account email, Razorpay payment ID, and invoice number where available. Do not include passwords, OTPs, or full payment-card details. Approved refunds are returned through the payment method or process permitted by the payment provider and applicable law.",
        },
        {
          heading: "Duplicate or failed payments",
          body: "If a payment appears to have been debited more than once or checkout reports a failure after a debit, contact support with the Razorpay order ID or payment ID and the approximate transaction date. We will review the payment records and coordinate any eligible reversal through the payment provider.",
        },
        {
          heading: "Contact",
          body: `For billing questions, contact ${settings.supportEmail ?? settings.contactEmail ?? "the support address configured by the service operator"} using the details shown above.`,
        },
      ]}
    />
  );
}
