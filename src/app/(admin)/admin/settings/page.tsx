import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { saveSiteSettingsAction } from "@/lib/admin/settings-actions";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Site settings" };

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

function TextField({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: string | null;
  type?: string;
}) {
  return (
    <label className="text-sm font-medium text-navy">
      {label}
      <input className={inputClass} defaultValue={value ?? ""} maxLength={500} name={name} type={type} />
    </label>
  );
}

function TextAreaField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string | null;
}) {
  return (
    <label className="block text-sm font-medium text-navy">
      {label}
      <textarea className={`${inputClass} font-mono text-xs`} defaultValue={value ?? ""} maxLength={30000} name={name} rows={5} />
    </label>
  );
}

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-navy">
      <input defaultChecked={checked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

export default async function AdminSettingsPage() {
  const settings = await getSiteSettings();

  return (
    <div className="space-y-6">
      <PageHeader title="Site settings" description="Legal, contact, tax, feature flags and public brand details." />
      <form action={saveSiteSettingsAction} className="space-y-5">
        <Card>
          <h2 className="mb-4 text-base font-bold text-navy">Brand and contact</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Brand name" name="brandName" value={settings.brandName} />
            <TextField label="Tagline" name="tagline" value={settings.tagline} />
            <TextField label="Sub-tagline" name="subTagline" value={settings.subTagline} />
            <TextField label="Legal company name" name="legalCompanyName" value={settings.legalCompanyName} />
            <TextField label="Contact email" name="contactEmail" value={settings.contactEmail} type="email" />
            <TextField label="Support email" name="supportEmail" value={settings.supportEmail} type="email" />
            <TextField label="Contact phone" name="contactPhone" value={settings.contactPhone} />
            <TextField label="Address line 1" name="addressLine1" value={settings.addressLine1} />
            <TextField label="Address line 2" name="addressLine2" value={settings.addressLine2} />
            <TextField label="City" name="city" value={settings.city} />
            <TextField label="State" name="state" value={settings.state} />
            <TextField label="Postal code" name="postalCode" value={settings.postalCode} />
            <TextField label="Country" name="country" value={settings.country} />
            <div>
              <TextField label="Jurisdiction city (optional)" name="jurisdictionCity" value={settings.jurisdictionCity} />
              <p className="mt-1 text-xs text-slate-500">Used for the courts-of-jurisdiction clause in the default Terms of Service.</p>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-bold text-navy">Tax and social links</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="GSTIN" name="gstin" value={settings.gstin} />
            <label className="text-sm font-medium text-navy">
              GST rate (%)
              <input className={inputClass} defaultValue={settings.gstRate} max="100" min="0" name="gstRate" required step="0.01" type="number" />
            </label>
            <TextField label="LinkedIn URL" name="socialLinkedin" value={settings.socialLinkedin} type="url" />
            <TextField label="X / Twitter URL" name="socialTwitter" value={settings.socialTwitter} type="url" />
            <TextField label="Facebook URL" name="socialFacebook" value={settings.socialFacebook} type="url" />
            <TextField label="Instagram URL" name="socialInstagram" value={settings.socialInstagram} type="url" />
            <TextField label="YouTube URL" name="socialYoutube" value={settings.socialYoutube} type="url" />
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-base font-bold text-navy">Legal policy overrides</h2>
          <Alert tone="warning">
            Draft: to be reviewed by legal counsel. This notice is shown to admins only; replace or approve the policy text before relying on it.
          </Alert>
          <TextAreaField label="Privacy policy" name="privacyPolicyOverride" value={settings.privacyPolicyOverride} />
          <TextAreaField label="Terms of service" name="termsOverride" value={settings.termsOverride} />
          <TextAreaField label="Refund and cancellation policy" name="refundPolicyOverride" value={settings.refundPolicyOverride} />
          <p className="text-xs text-slate-500">Legal text should be reviewed by qualified counsel before publishing.</p>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-base font-bold text-navy">Feature flags and operating settings</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Toggle checked={settings.autoApproveCompanies} label="Auto-approve companies after email verification" name="autoApproveCompanies" />
              <p className="mt-1 text-xs text-slate-500">When off, companies remain pending for the existing manual admin review.</p>
            </div>
            <div>
              <Toggle checked={settings.autoPublishJobs} label="Auto-publish jobs that pass the safety scan" name="autoPublishJobs" />
              <p className="mt-1 text-xs text-slate-500">Safety holds and blocks still apply; when off, clean jobs wait for manual review.</p>
            </div>
            <Toggle checked={settings.featureBlog} label="Blog enabled" name="featureBlog" />
            <Toggle checked={settings.featureReviews} label="Company reviews enabled" name="featureReviews" />
            <Toggle checked={settings.featureSalaryInsights} label="Salary insights enabled" name="featureSalaryInsights" />
            <Toggle checked={settings.featureResumeDatabase} label="Resume database enabled" name="featureResumeDatabase" />
            <Toggle checked={settings.maintenanceMode} label="Maintenance mode" name="maintenanceMode" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-navy">
              Resume database view limit
              <input className={inputClass} defaultValue={settings.resumeDbViewLimit} max="100000" min="1" name="resumeDbViewLimit" required type="number" />
            </label>
            <label className="text-sm font-medium text-navy">
              Job-post warning threshold (%)
              <input className={inputClass} defaultValue={settings.jobPostWarningThreshold} max="100" min="1" name="jobPostWarningThreshold" required type="number" />
            </label>
            <label className="text-sm font-medium text-navy">
              Free lifetime job posts per company
              <input className={inputClass} defaultValue={settings.freeJobPosts} max="100" min="0" name="freeJobPosts" required type="number" />
              <span className="mt-1 block text-xs font-normal text-slate-500">Default is 1. Changing this affects the lifetime allowance available to companies; it does not reset credits already used.</span>
            </label>
          </div>
        </Card>
        <button className="rounded-xl bg-royal px-5 py-3 text-sm font-semibold text-white hover:bg-navy" type="submit">Save settings</button>
      </form>
    </div>
  );
}
