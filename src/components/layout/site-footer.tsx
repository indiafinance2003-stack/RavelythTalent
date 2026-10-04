import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getSiteSettings, socialLinks } from "@/lib/settings";

export async function SiteFooter() {
  const settings = await getSiteSettings();
  const social = socialLinks(settings);

  const addressLine = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
    settings.country,
  ]
    .filter(Boolean)
    .join(", ");

  const contactBits = [
    settings.supportEmail ?? settings.contactEmail
      ? {
          label: "Email",
          value:
            settings.supportEmail && settings.supportEmail !== settings.contactEmail
              ? `${settings.supportEmail}`
              : (settings.contactEmail ?? ""),
          href: `mailto:${
            settings.supportEmail && settings.supportEmail !== settings.contactEmail
              ? settings.supportEmail
              : (settings.contactEmail ?? "")
          }`,
        }
      : null,
    settings.contactPhone
      ? { label: "Phone", value: settings.contactPhone, href: `tel:${settings.contactPhone}` }
      : null,
  ].filter((v): v is { label: string; value: string; href: string } => Boolean(v?.value));

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-slate-600">
              {settings.subTagline ?? "Right People | Better Opportunities | Stronger Tomorrow"}
            </p>
            <p className="mt-2 font-script text-xl text-teal">
              Your Next Opportunity Awaits
            </p>

            {social.length > 0 ? (
              <ul className="mt-5 flex flex-wrap gap-4">
                {social.map((s) => (
                  <li key={s.key}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-sm font-semibold text-navy hover:text-royal"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <nav aria-label="Job seekers">
            <h2 className="text-sm font-bold text-navy">Job seekers</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/jobs" className="text-slate-600 hover:text-royal">Browse jobs</Link></li>
              <li><Link href="/companies" className="text-slate-600 hover:text-royal">Companies</Link></li>
              <li><Link href="/pricing" className="text-slate-600 hover:text-royal">Candidate plans</Link></li>
              {settings.featureBlog ? (
                <li><Link href="/blog" className="text-slate-600 hover:text-royal">Career advice</Link></li>
              ) : null}
              <li><Link href="/faq" className="text-slate-600 hover:text-royal">FAQ</Link></li>
            </ul>
          </nav>

          <nav aria-label="Employers">
            <h2 className="text-sm font-bold text-navy">Employers</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/register?role=recruiter" className="text-slate-600 hover:text-royal">Post a job</Link></li>
              <li><Link href="/pricing?audience=employer" className="text-slate-600 hover:text-royal">Employer plans</Link></li>
              <li><Link href="/about" className="text-slate-600 hover:text-royal">About us</Link></li>
              <li><Link href="/contact" className="text-slate-600 hover:text-royal">Contact</Link></li>
            </ul>
          </nav>
        </div>

        {contactBits.length > 0 || addressLine ? (
          <div className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {contactBits.map((c) => (
                <li key={c.label}>
                  <span className="font-semibold text-navy">{c.label}: </span>
                  <a href={c.href} className="hover:text-royal">{c.value}</a>
                </li>
              ))}
            </ul>
            {addressLine ? <p className="mt-2">{addressLine}</p> : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500">
          <p>
            &copy; {new Date().getFullYear()} {settings.brandName}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-4">
            <li><Link href="/privacy" className="hover:text-royal">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-royal">Terms of Service</Link></li>
            <li><Link href="/refund-policy" className="hover:text-royal">Refund Policy</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}