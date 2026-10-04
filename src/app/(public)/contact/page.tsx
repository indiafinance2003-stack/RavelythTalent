import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { ContactForm } from "@/components/contact/contact-form";
import { getEnv } from "@/lib/env";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the Ravelyth Talent support team.",
};

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const supportEmail = settings.supportEmail ?? settings.contactEmail ?? getEnv().SUPPORT_EMAIL;
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
    settings.country,
  ].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title="Contact us" description="Send a message to the Ravelyth Talent support team." />
      <Card className="space-y-5">
        {supportEmail ? (
          <div className="space-y-1 text-sm text-slate-600">
            <p>Email: <a className="font-semibold text-royal hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
            {settings.contactPhone ? <p>Phone: <a className="font-semibold text-royal hover:underline" href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a></p> : null}
            {address ? <p>Address: {address}</p> : null}
          </div>
        ) : null}
        {supportEmail ? (
          <ContactForm />
        ) : (
          <Alert tone="warning">The support inbox is not configured yet. Please check back later.</Alert>
        )}
      </Card>
    </div>
  );
}
