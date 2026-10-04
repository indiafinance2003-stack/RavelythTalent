import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getCategoriesWithCounts } from "@/lib/companies/queries";
import { getJobQuota } from "@/lib/entitlements";
import { resolveRecruiterCompany } from "@/lib/recruiter/service";
import { JobForm } from "@/components/recruiter/job-form";
import { Alert, ButtonLink, EmptyState, PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post a job",
  description: "Create a new job posting.",
};

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter/jobs/new");
  const { company: companyIdParam } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyIdParam);

  if (!company) redirect("/recruiter/company");

  const [categories, quota] = await Promise.all([
    getCategoriesWithCounts(50),
    getJobQuota(company.id),
  ]);

  if (quota.limit !== null && quota.remaining === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Post a job" />
        <EmptyState
          title="Monthly quota reached"
          description={`You used all ${quota.limit} job posts for ${quota.periodLabel}. Upgrade or wait for the next period.`}
          action={
            <ButtonLink href="/pricing?audience=employer">Upgrade plan</ButtonLink>
          }
        />
      </div>
    );
  }

  const remainingCopy = quota.limit === null ? "No active plan - drafts only until you subscribe." : `${quota.remaining} of ${quota.limit} posts left this month.`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Post a job"
        description={`Posting as ${company.name}. ${remainingCopy}`}
      />

      {company.status !== "approved" ? (
        <Alert tone="warning" title="Drafts only until your company is approved">
          You can draft the posting now, but submit unlocks after verification.
        </Alert>
      ) : null}

      <JobForm
        companyId={company.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
