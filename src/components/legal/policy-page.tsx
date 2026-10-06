import { Card, PageHeader } from "@/components/ui/primitives";
import type { SiteSettings } from "@/lib/settings";

export type PolicySection = { heading: string; body: string };

export function PolicyPage({
  title,
  intro,
  override,
  sections,
  settings,
}: {
  title: string;
  intro: string;
  override: string | null;
  sections: PolicySection[];
  settings: SiteSettings;
}) {
  const legalName = settings.legalCompanyName?.trim() || null;
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
    settings.country,
  ].map((part) => part?.trim()).filter(Boolean).join(", ");
  const contactEmail = settings.supportEmail?.trim() || settings.contactEmail?.trim() || null;
  const contactPhone = settings.contactPhone?.trim() || null;
  const customParagraphs = override?.trim()
    ? override.trim().split(/\n\s*\n/).filter(Boolean)
    : null;

  return (
    <article className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title={title} description="Please read this policy carefully." />
      <Card>
        <p className="text-sm leading-7 text-slate-700">{intro}</p>
        {legalName || address || contactEmail || contactPhone ? (
          <dl className="mt-5 grid gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
            {legalName ? <div><dt className="font-semibold text-navy">Service operator</dt><dd className="mt-1 text-slate-600">{legalName}</dd></div> : null}
            {address ? <div><dt className="font-semibold text-navy">Address</dt><dd className="mt-1 text-slate-600">{address}</dd></div> : null}
            {contactEmail ? <div><dt className="font-semibold text-navy">Email</dt><dd className="mt-1 text-slate-600">{contactEmail}</dd></div> : null}
            {contactPhone ? <div><dt className="font-semibold text-navy">Phone</dt><dd className="mt-1 text-slate-600">{contactPhone}</dd></div> : null}
          </dl>
        ) : null}
        <p className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-500">Last updated: 6 October 2026</p>
      </Card>
      {customParagraphs ? (
        <Card>
          <div className="space-y-4">
            {customParagraphs.map((paragraph, index) => (
              <p key={index} className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{paragraph}</p>
            ))}
          </div>
        </Card>
      ) : sections.map((section) => (
        <Card key={section.heading}>
          <h2 className="text-lg font-bold text-navy">{section.heading}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{section.body}</p>
        </Card>
      ))}
    </article>
  );
}
