import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current-user";
import { getCompanyForEdit, resolveRecruiterCompany } from "@/lib/recruiter/service";
import {
  CompanyProfileForm,
  CreateCompanyForm,
  VerificationUploadForm,
  type CompanyFormValues,
} from "@/components/recruiter/company-form";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import {
  SwitchToCandidateForm,
} from "@/components/candidate/employer-conversion";
import { getSwitchBackBlockReason } from "@/lib/auth/employer-conversion";
import { setSocialPromotionOptOutAction } from "@/lib/social/company-opt-out";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Company",
  description: "Manage your company profile and verification.",
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  suspended: "danger",
};

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter/company");
  const { company: companyIdParam } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyIdParam);

  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Company"
          description="Create your company to start hiring."
        />
        <CreateCompanyForm />
      </div>
    );
  }

  const detail = await getCompanyForEdit(user.id, company.id);

  const values: CompanyFormValues = {
    companyId: detail.id,
    name: detail.name,
    about: detail.about,
    industry: detail.industry,
    size: detail.size,
    website: detail.website,
    foundedYear: detail.foundedYear,
    headquarters: detail.headquarters,
    locations: (detail.locations ?? []).map((l) => l.city),
    contactEmail: detail.contactEmail,
    contactPhone: detail.contactPhone,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company"
        description="Profile, verification and public presence."
        action={<Badge tone={STATUS_TONE[detail.status] ?? "neutral"}>{detail.status}</Badge>}
      />

      {detail.status === "approved" ? (
        <Alert tone="success" title="Company approved">
          Your company is verified. Job submissions are unlocked (subject to your plan quota).
        </Alert>
      ) : detail.status === "rejected" ? (
        <Alert tone="error" title="Verification needs attention">
          {detail.statusReason ?? "Please upload a clearer document and submit again."}
        </Alert>
      ) : detail.status === "suspended" ? (
        <Alert tone="error" title="Company suspended">
          Contact support - this account cannot post jobs while suspended.
        </Alert>
      ) : (
        <Alert tone="info" title="Verification in review">
          An admin reviews submitted documents, usually within 1-2 business days.
          Job posting unlocks once your company is approved.
        </Alert>
      )}

      <CompanyProfileForm values={values} />

      <Card>
        <h2 className="text-base font-bold text-navy">Verification</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload your GST certificate, certificate of incorporation or Udyam
          registration. Resubmitting after a rejection returns you to the review queue.
        </p>
        <div className="mt-4">
          <VerificationUploadForm companyId={detail.id} />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-navy">Public company page</h2>
        <p className="mt-1 text-sm text-slate-600">
          Your approved company gets a shareable page at{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            /companies/{detail.slug}
          </code>
          .
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-navy">Social media promotion</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ravelyth may promote your published job posts and company name on its own social media
          channels, free of charge. You can opt out at any time; already queued posts stop being
          sent.
        </p>
        <form action={setSocialPromotionOptOutAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input name="companyId" type="hidden" value={detail.id} />
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input
              defaultChecked={detail.socialPromotionOptOut}
              name="optOut"
              type="checkbox"
            />
            Do not promote my jobs on Ravelyth&apos;s social media
          </label>
          <Button size="sm" type="submit">
            Save preference
          </Button>
        </form>
      </Card>

      {detail.ownerUserId === user.id ? (
        <SwitchToCandidateForm reason={await getSwitchBackBlockReason(user.id)} />
      ) : null}
    </div>
  );
}
