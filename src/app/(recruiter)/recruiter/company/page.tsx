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
import { updateCompanyChatSettings } from "@/lib/chat/company-actions";
import { getCompanyChatFlags } from "@/lib/chat/queries";
import { isGlobalChatEnabled } from "@/lib/chat/gate";

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
  const [chatGloballyEnabled, chatFlags] = await Promise.all([
    isGlobalChatEnabled(),
    getCompanyChatFlags(detail.id),
  ]);

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

      {chatGloballyEnabled ? (
        <Card>
          <h2 className="text-sm font-bold text-navy">Candidate chat</h2>
          <p className="mt-1 text-sm text-slate-600">
            Let candidates message you. Pre-application questions let a candidate
            ask one plain-text question per job before they apply. You can only
            start a conversation with a candidate after they apply.
          </p>
          <form
            action={updateCompanyChatSettings}
            className="mt-4 space-y-3"
          >
            <input name="companyId" type="hidden" value={detail.id} />
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-royal focus:ring-royal"
                defaultChecked={chatFlags?.chatEnabled ?? false}
                name="chatEnabled"
                type="checkbox"
              />
              Enable chat for my company
            </label>
            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-royal focus:ring-royal"
                defaultChecked={chatFlags?.chatBeforeApplyEnabled ?? false}
                name="chatBeforeApplyEnabled"
                type="checkbox"
              />
              Allow one pre-application question per job
            </label>
            <Button size="sm" type="submit">
              Save chat settings
            </Button>
          </form>
        </Card>
      ) : null}

      {detail.ownerUserId === user.id ? (
        <SwitchToCandidateForm reason={await getSwitchBackBlockReason(user.id)} />
      ) : null}
    </div>
  );
}
