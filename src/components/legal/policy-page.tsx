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
  const legalName = settings.legalCompanyName?.trim() || settings.brandName;
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
    settings.country,
  ].filter(Boolean).join(", ");
  const customParagraphs = override?.trim()
    ? override.trim().split(/\n\s*\n/).filter(Boolean)
    : null;

  return (
    <article className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title={title} description="Please read this policy carefully." />
      <Card>
        <p className="text-sm leading-7 text-slate-700">{intro}</p>
        <dl className="mt-5 grid gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold text-navy">Service operator</dt><dd className="mt-1 text-slate-600">{legalName}</dd></div>
          {address ? <div><dt className="font-semibold text-navy">Address</dt><dd className="mt-1 text-slate-600">{address}</dd></div> : null}
          {settings.supportEmail || settings.contactEmail ? (
            <div><dt className="font-semibold text-navy">Contact</dt><dd className="mt-1 text-slate-600">{settings.supportEmail ?? settings.contactEmail}</dd></div>
          ) : null}
        </dl>
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
