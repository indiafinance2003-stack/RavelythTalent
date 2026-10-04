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
import { formatDate } from "@/lib/utils";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
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

  const [quota, jobs, applicationCounts] = await Promise.all([
    getJobQuota(company.id),
    listCompanyJobs(company.id),
    countApplicationsByStatus(company.id),
  ]);

  const totalApplications = applicationCounts.reduce((sum, row) => sum + row.value, 0);
  const openJobs = jobs.filter((j) => j.status === "published").length;
  const inReview = jobs.filter((j) => j.status === "pending_approval").length;
  const recent = jobs.slice(0, 5);

  const stats = [
    { label: "Live jobs", value: openJobs, icon: Briefcase },
    { label: "Applicants", value: totalApplications, icon: UsersRound },
    { label: "In review", value: inReview, icon: AlertCircle },
    { label: "All jobs", value: jobs.length, icon: Inbox },
  ];

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-sky-tint p-2.5 text-royal">
                <stat.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-extrabold text-navy">{stat.value}</p>
                <p className="text-sm text-slate-600">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-navy">Job post quota</h2>
            <p className="mt-1 text-sm text-slate-600">
              {quota.used} of{" "}
              {quota.limit === null ? "unlimited" : quota.limit} used in{" "}
              {quota.periodLabel}
              {quota.planName ? ` · ${quota.planName}` : ""}
            </p>
          </div>
          {quota.limit === null ? (
            <ButtonLink href="/pricing?audience=employer" size="sm">
              Choose a plan
            </ButtonLink>
          ) : (
            <Badge tone={quota.remaining === 0 ? "danger" : "success"}>
              {quota.remaining} left
            </Badge>
          )}
        </div>
        {quota.limit !== null ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={quota.percentUsed >= 100 ? "h-full bg-red-500" : "h-full bg-royal"}
              style={{ width: `${Math.max(2, quota.percentUsed)}%` }}
            />
          </div>
        ) : null}
      </Card>

      <section aria-labelledby="recent-jobs">
        <div className="flex items-center justify-between">
          <h2 id="recent-jobs" className="text-base font-bold text-navy">
            Recent jobs
          </h2>
          <Link
            href="/recruiter/jobs"
            className="text-sm font-semibold text-royal hover:underline"
          >
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No jobs yet"
              description="Post your first job to start receiving applications."
              action={
                <ButtonLink href="/recruiter/jobs/new">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Post a job
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {recent.map((job) => (
              <li key={job.id} className="surface flex flex-wrap items-center gap-3 p-4">
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
      </section>
    </div>
  );
}
