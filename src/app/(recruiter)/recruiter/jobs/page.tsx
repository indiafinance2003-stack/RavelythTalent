import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { getJobQuota } from "@/lib/entitlements";
import {
  listCompanyJobs,
  resolveRecruiterCompany,
} from "@/lib/recruiter/service";
import { jobLifecycleAction, submitJobAction } from "@/lib/recruiter/actions";
import { JOB_STATUS_LABEL, formatDate } from "@/lib/utils";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Manage your job postings.",
};

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  published: "success",
  pending_approval: "warning",
  rejected: "danger",
  draft: "neutral",
  paused: "neutral",
  closed: "neutral",
  expired: "neutral",
};

export default async function RecruiterJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; status?: string }>;
}) {
  const user = await requireUser("/recruiter/jobs");
  const { company: companyIdParam, status } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyIdParam);

  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Jobs" description="Post and manage openings." />
        <EmptyState
          title="Set up your company first"
          description="A company profile is required before posting jobs."
          action={<ButtonLink href="/recruiter/company">Set up company</ButtonLink>}
        />
      </div>
    );
  }

  const [quota, allJobs] = await Promise.all([
    getJobQuota(company.id),
    listCompanyJobs(company.id, { status }),
  ]);

  const FILTERS = ["", "draft", "pending_approval", "published", "paused", "closed", "rejected"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description={quota.usesFreeCredit
          ? `${quota.freeRemaining} of ${quota.freeLimit} lifetime free job posts remaining.`
          : `${quota.used} of ${quota.limit ?? "unlimited"} job posts used in ${quota.periodLabel}.`}
        action={
          <ButtonLink href="/recruiter/jobs/new">
            <Plus className="h-4 w-4" aria-hidden="true" /> Post a job
          </ButtonLink>
        }
      />

      {quota.usesFreeCredit && quota.freeRemaining === 0 ? (
        <Alert tone="warning" title="Upgrade to submit another job">
          Your company&apos;s one-time free posting credit has been used.{" "}
          <Link className="font-semibold text-royal hover:underline" href="/pricing?audience=employer">
            Compare employer plans
          </Link>
          .
        </Alert>
      ) : null}

      {company.status !== "approved" ? (
        <Alert tone="warning" title="Company not approved">
          You can save drafts now; submitting for approval waits until your company
          is verified.
        </Alert>
      ) : null}

      <nav aria-label="Filter jobs" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const href = f ? `/recruiter/jobs?status=${f}` : "/recruiter/jobs";
          const active = (status ?? "") === f;
          return (
            <Link
              key={f || "all"}
              href={href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                active
                  ? "bg-royal text-white"
                  : "border border-slate-300 bg-white text-navy hover:border-royal"
              }`}
            >
              {f ? (JOB_STATUS_LABEL[f] ?? f) : "All"}
            </Link>
          );
        })}
      </nav>

      {allJobs.length === 0 ? (
        <EmptyState
          title={status ? "No jobs with that status" : "No jobs yet"}
          description="Post your first opening - drafts are free and never consume quota."
          action={
            <ButtonLink href="/recruiter/jobs/new">
              <Plus className="h-4 w-4" aria-hidden="true" /> Post a job
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-4">
          {allJobs.map((job) => (
            <li key={job.id} className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-navy">{job.title}</h2>
                    <Badge tone={STATUS_TONE[job.status] ?? "neutral"}>
                      {JOB_STATUS_LABEL[job.status] ?? job.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {job.city ?? "India"} · {job.jobType.replace(/_/g, " ")} ·{" "}
                    {job.workMode} · created {formatDate(job.createdAt)}
                  </p>
                  {job.status === "rejected" && job.moderationNotes ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      Reviewer note: {job.moderationNotes}
                    </p>
                  ) : null}
                  {job.status === "pending_approval" ? (
                    <p className="mt-2 text-sm text-slate-600">
                      Under review by the Ravelyth team.
                    </p>
                  ) : null}
                  {job.status === "pending_approval" && job.moderationNotes ? (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      Review reasons: {job.moderationNotes}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span>{job.applicationsCount} applicants</span>
                  <span>{job.viewsCount} views</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/recruiter/jobs/${job.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal"
                >
                  Edit
                </Link>
                <Link
                  href={`/recruiter/applications?job=${job.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal"
                >
                  Applicants
                </Link>
                {job.status === "draft" || job.status === "rejected" ? (
                  <form action={submitJobAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="companyId" value={company.id} />
                    <Button type="submit" size="sm" variant="secondary">
                      Submit for approval
                    </Button>
                  </form>
                ) : null}
                {job.status === "published" ? (
                  <form action={jobLifecycleAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="companyId" value={company.id} />
                    <input type="hidden" name="action" value="pause" />
                    <Button type="submit" size="sm" variant="secondary">Pause</Button>
                  </form>
                ) : null}
                {job.status === "paused" ? (
                  <form action={jobLifecycleAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="companyId" value={company.id} />
                    <input type="hidden" name="action" value="resume" />
                    <Button type="submit" size="sm">Resume</Button>
                  </form>
                ) : null}
                {job.status === "published" || job.status === "paused" ? (
                  <form action={jobLifecycleAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="companyId" value={company.id} />
                    <input type="hidden" name="action" value="close" />
                    <Button type="submit" size="sm" variant="danger">Close</Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
