import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Briefcase, Inbox, Plus, UsersRound } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { getJobQuota, listUserCompanies } from "@/lib/entitlements";
import {
  countApplicationsByStatus,
  listCompanyJobs,
  resolveRecruiterCompany,
} from "@/lib/recruiter/service";
import {
  getBoardApplicants,
  getCompanyUpcomingInterviews,
  getJobFunnel,
} from "@/lib/recruiter/overview";
import {
  DataTable,
  KpiCard,
  ProgressBar,
  SectionCard,
  StatusChip,
  type DataTableColumn,
} from "@/components/dashboard/kit";
import { BarsChart, ChartCard } from "@/components/dashboard/charts";
import { PipelineBoard } from "@/components/recruiter/pipeline-board";
import { formatDate, formatIndianDateTime, labelFor } from "@/lib/utils";
import { formatCount } from "@/lib/dashboard/format";
import {
  Alert,
  Badge,
  ButtonLink,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recruiter overview",
  description: "Your hiring pipeline at a glance.",
};

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  published: "success",
  pending_approval: "warning",
  draft: "neutral",
  paused: "neutral",
  closed: "neutral",
  expired: "neutral",
  rejected: "danger",
};

const CHART_SERIES = [
  { label: "Views", color: "#1F6FEB" },
  { label: "Applications", color: "#3DB8B0" },
];

type FunnelRow = Awaited<ReturnType<typeof getJobFunnel>>[number];

const FUNNEL_COLUMNS: Array<DataTableColumn<FunnelRow>> = [
  { key: "title", header: "Job" },
  {
    key: "views",
    header: "Views",
    align: "right",
    cell: (row) => formatCount(row.views),
  },
  {
    key: "applications",
    header: "Applications",
    align: "right",
    cell: (row) => formatCount(row.applications),
  },
];

const INTERVIEW_MODE: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  in_person: "On-site",
};

export default async function RecruiterOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter");
  const { company: companyIdParam } = await searchParams;

  const allCompanies = await listUserCompanies(user.id);
  const company = await resolveRecruiterCompany(user.id, companyIdParam);

  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Welcome to Ravelyth Talent"
          description="Create your company profile to start posting jobs."
        />
        <EmptyState
          icon={<Briefcase className="h-8 w-8" aria-hidden="true" />}
          title="No company yet"
          description="Set up your company, submit verification documents and start hiring."
          action={
            <ButtonLink href="/recruiter/company">
              Set up your company
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const [quota, jobs, applicationCounts, board, funnel, interviews] =
    await Promise.all([
      getJobQuota(company.id),
      listCompanyJobs(company.id),
      countApplicationsByStatus(company.id),
      getBoardApplicants(company.id, 30),
      getJobFunnel(company.id),
      getCompanyUpcomingInterviews(company.id),
    ]);

  const totalApplications = applicationCounts.reduce((sum, row) => sum + row.value, 0);
  const openJobs = jobs.filter((j) => j.status === "published").length;
  const inReview = jobs.filter((j) => j.status === "pending_approval").length;
  const recent = jobs.slice(0, 5);
  const countsByStatus = Object.fromEntries(
    applicationCounts.map((row) => [row.status, row.value]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={`Hiring overview for ${company.name}.`}
        action={
          <ButtonLink href="/recruiter/jobs/new">
            <Plus className="h-4 w-4" aria-hidden="true" /> Post a job
          </ButtonLink>
        }
      />

      {allCompanies.length > 1 ? (
        <Alert tone="info" title="Viewing one company">
          Showing {company.name}. Other companies:{" "}
          {allCompanies
            .filter((c) => c.id !== company.id)
            .map((c) => (
              <Link
                key={c.id}
                href={`/recruiter?company=${c.id}`}
                className="mx-1 font-semibold text-royal hover:underline"
              >
                {c.name}
              </Link>
            ))}
          .
        </Alert>
      ) : null}

      {company.status !== "approved" ? (
        <Alert tone="warning" title="Company not approved yet">
          Your company is {company.status === "pending" ? "under review" : company.status}.
          Job submissions stay locked until an admin approves your company. Complete
          your profile and upload verification documents on the Company page.
        </Alert>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          href="/recruiter/jobs"
          hint="Accepting applicants now"
          icon={Briefcase}
          label="Live jobs"
          tone="teal"
          value={formatCount(openJobs)}
        />
        <KpiCard
          href="/recruiter/applications"
          hint="Across all of your jobs"
          icon={UsersRound}
          label="Applicants"
          value={formatCount(totalApplications)}
        />
        <KpiCard
          href="/recruiter/jobs"
          hint="Waiting for admin review"
          icon={AlertCircle}
          label="In review"
          tone={inReview > 0 ? "warning" : "brand"}
          value={formatCount(inReview)}
        />
        <KpiCard
          href="/recruiter/jobs"
          hint="Including drafts and closed roles"
          icon={Inbox}
          label="All jobs"
          value={formatCount(jobs.length)}
        />
      </div>

      {/* Pipeline board */}
      <SectionCard
        action={
          <Link
            className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
            href="/recruiter/applications"
          >
            Open full pipeline
          </Link>
        }
        description="Move candidates between stages with the control on each card. Column numbers are live totals."
        title="Hiring pipeline"
      >
        {board.length === 0 ? (
          <EmptyState
            description="Applications will land here as candidates apply to your jobs."
            icon={<UsersRound className="h-10 w-10" aria-hidden="true" />}
            title="No applicants yet"
            action={
              <ButtonLink href="/recruiter/jobs/new" size="sm">
                Post a job
              </ButtonLink>
            }
          />
        ) : (
          <PipelineBoard
            applicants={board.map((row) => ({
              id: row.id,
              status: row.status,
              candidateName: row.candidateName,
              jobTitle: row.jobTitle,
              appliedAt: row.createdAt,
              isPremium: row.isPremium,
            }))}
            counts={countsByStatus}
          />
        )}
      </SectionCard>

      {/* Views vs applications + upcoming interviews */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Views against applications for your most-viewed jobs."
          title="Views vs applications"
        >
          <BarsChart
            ariaLabel="Views and applications per job for your most viewed jobs"
            height={200}
            points={funnel.map((row) => ({
              label:
                row.title.length > 14 ? `${row.title.slice(0, 13)}…` : row.title,
              values: [row.views, row.applications],
            }))}
            series={CHART_SERIES.map((entry) => ({ ...entry }))}
          />
          <DataTable
            caption="Exact views and applications per job"
            columns={FUNNEL_COLUMNS}
            empty={
              <p className="text-sm text-slate-500">
                Post a job and its views will appear here.
              </p>
            }
            rowKey={(row) => row.jobId}
            rows={funnel}
          />
        </ChartCard>

        <SectionCard
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/recruiter/interviews"
            >
              All interviews
            </Link>
          }
          title="Upcoming interviews"
        >
          {interviews.length === 0 ? (
            <EmptyState
              description="Schedule an interview from any shortlisted applicant."
              icon={<UsersRound className="h-10 w-10" aria-hidden="true" />}
              title="No interviews scheduled"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {interviews.map((interview) => (
                <li className="py-3 first:pt-0 last:pb-0" key={interview.id}>
                  <p className="truncate text-sm font-bold text-navy">
                    {interview.candidateName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {interview.jobTitle}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <StatusChip tone="brand">
                      {formatIndianDateTime(interview.scheduledAt)}
                    </StatusChip>
                    <span className="text-slate-500">
                      {labelFor(INTERVIEW_MODE, interview.mode)}
                    </span>
                    <StatusChip
                      tone={interview.status === "confirmed" ? "success" : "teal"}
                    >
                      {labelFor(
                        {
                          scheduled: "Awaiting confirmation",
                          confirmed: "Confirmed",
                          rescheduled: "Rescheduled",
                        },
                        interview.status,
                      )}
                    </StatusChip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Plan / quota */}
      <SectionCard
        description={
          quota.usesFreeCredit
            ? "Your lifetime free job posts."
            : "Job posts included with your current plan."
        }
        title={
          quota.usesFreeCredit
            ? "Lifetime free job posts"
            : `Monthly job-post quota${quota.planName ? ` · ${quota.planName}` : ""}`
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {quota.usesFreeCredit
              ? `${quota.freeRemaining} of ${quota.freeLimit} free job posts remaining`
              : `${quota.used} of ${quota.limit ?? "unlimited"} used in ${quota.periodLabel}`}
          </p>
          {quota.limit !== null ? (
            <ProgressBar
              label={`${quota.percentUsed}% of the monthly quota used`}
              percent={quota.percentUsed}
              tone={quota.percentUsed >= 100 ? "danger" : "brand"}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {quota.usesFreeCredit ? (
              <ButtonLink href="/pricing?audience=employer" size="sm">
                {quota.freeRemaining > 0 ? "View paid plans" : "Upgrade to post again"}
              </ButtonLink>
            ) : quota.limit === null ? (
              <ButtonLink href="/pricing?audience=employer" size="sm">
                Choose a plan
              </ButtonLink>
            ) : (
              <Badge tone={quota.remaining === 0 ? "danger" : "success"}>
                {quota.remaining} left
              </Badge>
            )}
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/recruiter/billing"
            >
              Billing
            </Link>
          </div>
          {quota.usesFreeCredit && quota.freeRemaining === 0 ? (
            <Alert tone="warning" title="Your free job post has been used">
              Your free credit is lifetime and is not restored if a post is rejected,
              closed or deleted. Choose a paid employer plan to submit another job.
            </Alert>
          ) : null}
        </div>
      </SectionCard>

      {/* Recent jobs */}
      <SectionCard
        action={
          <Link
            className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
            href="/recruiter/jobs"
          >
            View all
          </Link>
        }
        title="Recent jobs"
      >
        {recent.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            description="Post your first job to start receiving applications."
            action={
              <ButtonLink href="/recruiter/jobs/new">
                <Plus className="h-4 w-4" aria-hidden="true" /> Post a job
              </ButtonLink>
            }
          />
        ) : (
          <ul className="space-y-3">
            {recent.map((job) => (
              <li
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white p-4"
                key={job.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{job.title}</p>
                  <p className="text-sm text-slate-600">
                    {job.city ?? "India"} · created {formatDate(job.createdAt)}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[job.status] ?? "neutral"}>
                  {job.status.replace(/_/g, " ")}
                </Badge>
                <span className="text-sm text-slate-600">
                  {job.applicationsCount} applicants
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
