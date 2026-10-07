import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BellRing,
  BookmarkCheck,
  CalendarClock,
  CheckCircle2,
  Crown,
  FileText,
  Send,
  Target,
} from "lucide-react";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui/primitives";
import {
  DataTable,
  KpiCard,
  MetricRow,
  RingProgress,
  SectionCard,
  StatusChip,
  type DataTableColumn,
} from "@/components/dashboard/kit";
import { JobCardView } from "@/components/jobs/job-card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCompleteness, type CompletenessCheck } from "@/lib/candidate/profile";
import {
  getAlertsSummary,
  getApplicationSummary,
  getRecommendedJobs,
  getSavedJobsCount,
  getUpcomingInterviews,
} from "@/lib/candidate/dashboard";
import { getUserPlan } from "@/lib/entitlements";
import { countUnreadNotifications } from "@/lib/notifications";
import { formatCount, matchLabelFor } from "@/lib/dashboard/format";
import { greetingForHour, istParts } from "@/lib/dashboard/ist";
import {
  APPLICATION_STATUS_LABEL,
  formatDate,
  formatIndianDateTime,
  labelFor,
} from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "brand" | "teal" | "success" | "danger" | "neutral"> = {
  applied: "brand",
  viewed: "teal",
  shortlisted: "success",
  interview: "teal",
  offered: "success",
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

type RecentApplication = {
  id: string;
  status: string;
  createdAt: Date;
  jobTitle: string;
  jobSlug: string;
  companyName: string;
};

const APPLICATION_COLUMNS: Array<DataTableColumn<RecentApplication>> = [
  {
    key: "jobTitle",
    header: "Job",
    cell: (row) => (
      <Link
        className="font-semibold text-navy hover:text-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
        href={`/jobs/${row.jobSlug}`}
      >
        {row.jobTitle}
      </Link>
    ),
  },
  { key: "companyName", header: "Company" },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <StatusChip tone={STATUS_TONE[row.status] ?? "neutral"}>
        {labelFor(APPLICATION_STATUS_LABEL, row.status)}
      </StatusChip>
    ),
  },
  {
    key: "createdAt",
    header: "Applied",
    align: "right",
    cell: (row) => formatDate(row.createdAt),
  },
];

export default async function CandidateDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard");
  if (!user.emailVerifiedAt) redirect("/verify-email");
  if (user.role === "admin") redirect("/admin");
  if (user.role === "recruiter") redirect("/recruiter");

  const now = new Date();
  const [
    completeness,
    plan,
    applications,
    interviews,
    recommendations,
    savedCount,
    alerts,
    unread,
  ] = await Promise.all([
    getCompleteness(user.id),
    getUserPlan(user.id),
    getApplicationSummary(user.id),
    getUpcomingInterviews(user.id),
    getRecommendedJobs(user.id),
    getSavedJobsCount(user.id),
    getAlertsSummary(user.id),
    countUnreadNotifications(user.id),
  ]);

  const missing = completeness.checks.filter((check) => !check.done).slice(0, 4);
  const firstName = user.fullName.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greetingForHour(istParts(now).hour)}, ${firstName}`}
        description={`Here is your job hunt at a glance for ${formatIndianDateTime(now)}.`}
        action={
          <ButtonLink href="/jobs" size="sm">
            <Send className="h-4 w-4" aria-hidden="true" />
            Find jobs
          </ButtonLink>
        }
      />

      {/* Profile strength + plan + activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/dashboard/profile"
            >
              Complete profile
            </Link>
          }
          description="Recruiters see a stronger profile first."
          title="Profile strength"
        >
          <div className="flex flex-wrap items-center gap-5">
            <RingProgress
              label="Profile completeness"
              percent={completeness.percent}
              sublabel="complete"
            />
            <ul className="min-w-0 flex-1 space-y-2">
              {missing.length === 0 ? (
                <li className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
                  Every profile section is filled in. Nice work.
                </li>
              ) : (
                missing.map((check: CompletenessCheck) => (
                  <li key={check.key}>
                    <Link
                      className="inline-flex items-center gap-2 text-sm font-semibold text-navy hover:text-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                      href={check.href}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                      {check.label}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </SectionCard>

        <SectionCard
          description={
            plan
              ? "Your premium subscription is active."
              : "Unlock premium tooling for your search."
          }
          title={plan ? "Your plan" : "Go Premium"}
        >
          {plan ? (
            <div className="space-y-1">
              <p className="text-lg font-extrabold text-navy">{plan.planName}</p>
              <MetricRow
                label="Renews"
                value={formatDate(plan.currentPeriodEnd)}
              />
              <MetricRow
                label="Resume builder"
                value={
                  plan.features.get("resume_builder")?.enabled
                    ? "Included"
                    : "Not in this plan"
                }
              />
              <div className="pt-2">
                <Link
                  className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                  href="/dashboard/billing"
                >
                  Manage billing
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
                Premium plans add the resume builder and other tools that get you
                noticed faster.
              </p>
              <ButtonLink href="/pricing" size="sm" variant="secondary">
                View plans
              </ButtonLink>
            </div>
          )}
        </SectionCard>

        <SectionCard description="Everything you have going on." title="Your activity">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              href="/dashboard/applications"
              icon={Target}
              label="Applications"
              value={formatCount(applications.total)}
            />
            <KpiCard
              href="/dashboard/saved"
              icon={BookmarkCheck}
              label="Saved jobs"
              value={formatCount(savedCount)}
            />
            <KpiCard
              href="/dashboard/alerts"
              icon={BellRing}
              label="Active alerts"
              tone="teal"
              value={formatCount(alerts.active)}
            />
            <KpiCard
              href="/dashboard/notifications"
              icon={FileText}
              label="Notifications"
              tone={unread > 0 ? "warning" : "brand"}
              value={formatCount(unread)}
            />
          </div>
        </SectionCard>
      </div>

      {/* Applications + interviews */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/dashboard/applications"
            >
              View all
            </Link>
          }
          title="Application tracker"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {applications.byStatus.length === 0 ? (
                <StatusChip tone="neutral">No applications yet</StatusChip>
              ) : (
                applications.byStatus.map((entry) => (
                  <StatusChip key={entry.status} tone={STATUS_TONE[entry.status] ?? "neutral"}>
                    {labelFor(APPLICATION_STATUS_LABEL, entry.status)} ·{" "}
                    {formatCount(entry.count)}
                  </StatusChip>
                ))
              )}
            </div>
            <DataTable
              caption="Your most recent applications"
              columns={APPLICATION_COLUMNS}
              empty={
                <EmptyState
                  description="Jobs you apply to will show up here with their live status."
                  icon={<Target className="h-10 w-10" aria-hidden="true" />}
                  title="No applications yet"
                  action={
                    <ButtonLink href="/jobs" size="sm">
                      Browse jobs
                    </ButtonLink>
                  }
                />
              }
              rowKey={(row) => row.id}
              rows={applications.recent}
            />
          </div>
        </SectionCard>

        <SectionCard
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/dashboard/interviews"
            >
              All interviews
            </Link>
          }
          title="Upcoming interviews"
        >
          {interviews.length === 0 ? (
            <EmptyState
              description="When an employer schedules an interview, it will appear here with the time and mode."
              icon={<CalendarClock className="h-10 w-10" aria-hidden="true" />}
              title="No interviews scheduled"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {interviews.map((interview) => (
                <li className="py-3 first:pt-0 last:pb-0" key={interview.id}>
                  <p className="text-sm font-bold text-navy">{interview.jobTitle}</p>
                  <p className="text-xs text-slate-500">{interview.companyName}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <StatusChip tone="brand">
                      {formatIndianDateTime(interview.scheduledAt)}
                    </StatusChip>
                    <span className="text-slate-500">
                      {labelFor(
                        {
                          video: "Video call",
                          phone: "Phone call",
                          in_person: "On-site",
                        },
                        interview.mode,
                      )}
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

      {/* Matches + alerts */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          description="Scored from your skills, location and experience - the same numbers every time."
          title="Recommended for you"
        >
          {recommendations.length === 0 ? (
            <EmptyState
              description="Add your skills and location to your profile and fresh roles will be scored for you here."
              icon={<Target className="h-10 w-10" aria-hidden="true" />}
              title="No recommendations yet"
              action={
                <ButtonLink href="/dashboard/profile" size="sm">
                  Update profile
                </ButtonLink>
              }
            />
          ) : (
            <div className="grid gap-4">
              {recommendations.map(({ job, match }) => (
                <JobCardView
                  badge={
                    <StatusChip
                      tone={
                        match.score >= 70
                          ? "success"
                          : match.score >= 50
                            ? "brand"
                            : "neutral"
                      }
                    >
                      {match.score}% {matchLabelFor(match.score) ?? "Match"}
                    </StatusChip>
                  }
                  job={job}
                  key={job.id}
                  showApply={false}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/dashboard/alerts"
            >
              Manage alerts
            </Link>
          }
          title="Job alerts"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                href="/dashboard/alerts"
                icon={BellRing}
                label="Active alerts"
                tone="teal"
                value={formatCount(alerts.active)}
              />
              <KpiCard
                href="/dashboard/alerts"
                icon={BellRing}
                label="Total alerts"
                value={formatCount(alerts.total)}
              />
            </div>
            <p className="text-sm text-slate-600">
              We email you the moment a matching job is published.
            </p>
            <ButtonLink href="/dashboard/alerts" size="sm" variant="secondary">
              Create an alert
            </ButtonLink>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
