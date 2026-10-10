import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getCategoriesWithCounts } from "@/lib/companies/queries";
import { EDITABLE_JOB_STATUSES, getCompanyJob, listCompanyApplications, resolveRecruiterCompany } from "@/lib/recruiter/service";
import { ApplicantStatusForm } from "@/components/recruiter/pipeline-status-form";
import { APPLICATION_STATUS_LABEL, formatDate } from "@/lib/utils";
import { JobForm, type JobFormValues } from "@/components/recruiter/job-form";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit job",
  description: "Update a job posting.",
};

function toFormValues(job: Awaited<ReturnType<typeof getCompanyJob>>): JobFormValues {
  return {
    title: job.title,
    description: job.description,
    responsibilities: job.responsibilities ?? "",
    requirements: job.requirements ?? "",
    categoryId: job.categoryId ?? "",
    jobType: job.jobType,
    workMode: job.workMode,
    city: job.city ?? "",
    state: job.state ?? "",
    salaryMinRupees: job.salaryMinPaise === null ? "" : String(Math.round(job.salaryMinPaise / 100)),
    salaryMaxRupees: job.salaryMaxPaise === null ? "" : String(Math.round(job.salaryMaxPaise / 100)),
    salaryPeriod: job.salaryPeriod,
    salaryHidden: job.salaryHidden,
    experienceMinYears: job.experienceMinYears ?? "",
    experienceMaxYears: job.experienceMaxYears ?? "",
    stipendType: job.stipendType ?? "",
    stipendMinRupees: job.stipendMinPaise === null ? "" : String(Math.round(job.stipendMinPaise / 100)),
    stipendMaxRupees: job.stipendMaxPaise === null ? "" : String(Math.round(job.stipendMaxPaise / 100)),
    durationMonths: job.durationMonths === null ? "" : String(job.durationMonths),
    startDate: job.startDate ? job.startDate.toISOString().slice(0, 10) : "",
    eligibility: job.eligibility ?? "",
    ppoPossible: job.ppoPossible,
    certificateProvided: job.certificateProvided,
    openings: job.openings,
    deadline: job.deadline ? job.deadline.toISOString().slice(0, 10) : "",
  };
}

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter/jobs");
  const [{ id }, { company: companyIdParam }] = await Promise.all([params, searchParams]);
  const company = await resolveRecruiterCompany(user.id, companyIdParam);
  if (!company) redirect("/recruiter/company");

  let job: Awaited<ReturnType<typeof getCompanyJob>>;
  try {
    job = await getCompanyJob(user.id, company.id, id);
  } catch {
    notFound();
  }

  const [categories, applicants] = await Promise.all([
    getCategoriesWithCounts(50),
    listCompanyApplications({ companyId: company.id, jobId: job.id }),
  ]);
  const locked = !EDITABLE_JOB_STATUSES.has(job.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit: ${job.title}`}
        description={`Status: ${job.status.replace(/_/g, " ")}. Saving never changes the publishing state.`}
        action={
          <ButtonLink href="/recruiter/jobs" variant="secondary" size="sm">
            Back to jobs
          </ButtonLink>
        }
      />

      {job.status === "rejected" && job.moderationNotes ? (
        <Alert tone="error" title="Reviewer note">
          {job.moderationNotes}
        </Alert>
      ) : null}
      {job.status === "pending_approval" && job.moderationNotes ? (
        <Alert tone="warning" title="Under review">
          The job is not visible to candidates while it is under review.
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {job.moderationNotes.split("\n").filter(Boolean).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {job.status === "published" ? (
        <Alert tone="info" title="Live posting">
          Edits apply immediately to the public listing. To unpublish, use Pause
          or Close on the <Link href="/recruiter/jobs" className="font-semibold text-royal hover:underline">Jobs list</Link>.
        </Alert>
      ) : null}

      <JobForm
        companyId={company.id}
        jobId={job.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        values={toFormValues(job)}
        mode="edit"
        locked={locked}
      />

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-navy">Recent applicants ({applicants.length})</h2>
          <Link href={`/recruiter/applications?job=${job.id}`} className="text-sm font-semibold text-royal hover:underline">
            Open full pipeline
          </Link>
        </div>
        {applicants.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No applications yet. Share the posting to get candidates.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {applicants.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{a.candidateName}</p>
                  <p className="text-xs text-slate-600">{a.headline ?? a.location ?? formatDate(a.createdAt)}</p>
                </div>
                <Badge tone={a.status === "rejected" ? "danger" : a.status === "hired" ? "success" : "neutral"}>
                  {APPLICATION_STATUS_LABEL[a.status] ?? a.status}
                </Badge>
                <ApplicantStatusForm applicationId={a.id} current={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
