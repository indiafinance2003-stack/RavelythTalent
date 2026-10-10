import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current-user";
import {
  countApplicationsByStatus,
  listCompanyApplications,
  listJobOptions,
  resolveRecruiterCompany,
} from "@/lib/recruiter/service";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui/primitives";
import { PipelineFilters, PipelineList } from "@/components/recruiter/pipeline-list";
import { isGlobalChatEnabled } from "@/lib/chat/gate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Applicants",
  description: "Review and move candidates through the pipeline.",
};

export default async function RecruiterApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; job?: string; status?: string }>;
}) {
  const user = await requireUser("/recruiter/applications");
  const { company: companyIdParam, job: jobIdParam, status } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyIdParam);

  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Applicants" description="Review candidates." />
        <EmptyState
          title="Set up your company first"
          description="A company profile is required before you can receive applications."
          action={<ButtonLink href="/recruiter/company">Set up company</ButtonLink>}
        />
      </div>
    );
  }

  const [rows, counts, jobOptions] = await Promise.all([
    listCompanyApplications({ companyId: company.id, jobId: jobIdParam, status }),
    countApplicationsByStatus(company.id),
    listJobOptions(company.id),
  ]);
  const total = counts.reduce((sum, r) => sum + r.value, 0);
  const chatEnabled = await isGlobalChatEnabled();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applicants"
        description={total === 0 ? "No applications yet." : `${total} applications across your jobs.`}
      />
      <PipelineFilters jobId={jobIdParam} status={status} jobs={jobOptions} />
      <PipelineList
        rows={rows}
        jobId={jobIdParam}
        jobs={jobOptions}
        chatEnabled={chatEnabled}
      />
    </div>
  );
}
