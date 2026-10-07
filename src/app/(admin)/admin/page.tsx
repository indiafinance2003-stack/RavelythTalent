import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Building2,
  CircleAlert,
  IndianRupee,
  Mail,
  MessageSquare,
  Share2,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import {
  KpiCard,
  MetricRow,
  ProgressBar,
  SectionCard,
  StatusChip,
} from "@/components/dashboard/kit";
import {
  BarsChart,
  ChartCard,
  CHART_COLORS,
  DonutChart,
  LineChart,
} from "@/components/dashboard/charts";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getAdminKpis,
  getAssistantOverview,
  getJobsByCategory,
  getNeedsAttention,
  getRecentActivity,
  getRevenueByMonth,
  getSignupSeries,
  getSocialOverview,
  type AttentionItem,
} from "@/lib/admin/overview";
import { formatCount, percentOf, trendOf } from "@/lib/dashboard/format";
import { greetingForHour, istParts } from "@/lib/dashboard/ist";
import { sumSeries } from "@/lib/dashboard/series";
import { compactNumber, formatIndianDateTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const ATTENTION_TONE: Record<AttentionItem["kind"], "warning" | "danger" | "brand"> = {
  job: "warning",
  report: "danger",
  thread: "brand",
};

const ATTENTION_LABEL: Record<AttentionItem["kind"], string> = {
  job: "Held job",
  report: "Report",
  thread: "Assistant",
};

export default async function AdminOverviewPage() {
  const user = await getCurrentUser();
  const now = new Date();
  const [
    kpis,
    revenue,
    signups,
    categorySlices,
    attention,
    activity,
    assistant,
    social,
  ] = await Promise.all([
    getAdminKpis(now),
    getRevenueByMonth(12, now),
    getSignupSeries(30, now),
    getJobsByCategory(),
    getNeedsAttention(),
    getRecentActivity(),
    getAssistantOverview(now),
    getSocialOverview(now),
  ]);

  const revenueTrend = trendOf(kpis.revenueThisMonthPaise, kpis.revenueLastMonthPaise);
  const signupsTotal = sumSeries(signups);
  const categoryTotal = sumSeries(categorySlices);
  const aiSpendUsd = assistant.spendMicros / 1_000_000;
  const connectedAccounts = assistant.accounts.filter((account) => account.configured);

  const formatRupees = (paise: number) => `₹${compactNumber(Math.round(paise / 100))}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greetingForHour(istParts(now).hour)}, ${user?.fullName?.split(" ")[0] ?? "Admin"}`}
        description={`Ravelyth platform overview for ${formatIndianDateTime(now)}. All figures below come straight from the database.`}
        action={
          <Link
            href="/admin/audit"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-royal hover:text-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
          >
            Audit log
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          href="/admin/users"
          hint="All registered accounts"
          icon={Users}
          label="Registered users"
          value={formatCount(kpis.registeredUsers)}
        />
        <KpiCard
          href="/admin/companies"
          hint="Awaiting moderation"
          icon={Building2}
          label="Pending companies"
          tone={kpis.pendingCompanies > 0 ? "warning" : "brand"}
          value={formatCount(kpis.pendingCompanies)}
        />
        <KpiCard
          href="/admin/jobs"
          hint="Live on the board"
          icon={Briefcase}
          label="Live jobs"
          tone="teal"
          value={formatCount(kpis.liveJobs)}
        />
        <KpiCard
          href="/admin/plans"
          hint="Renewing right now"
          icon={Sparkles}
          label="Active subscriptions"
          value={formatCount(kpis.activeSubscriptions)}
        />
        <KpiCard
          href="/admin/billing"
          hint="Captured payments this IST month"
          icon={IndianRupee}
          label="Revenue this month"
          trend={revenueTrend}
          value={formatRupees(kpis.revenueThisMonthPaise)}
        />
        <KpiCard
          href="/admin/reports"
          hint="Job reports awaiting review"
          icon={ShieldAlert}
          label="Open reports"
          tone={kpis.openReports > 0 ? "warning" : "brand"}
          value={formatCount(kpis.openReports)}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          description="Captured payments, by IST calendar month."
          title="Revenue (12 months)"
        >
          <LineChart
            ariaLabel={`Captured revenue over the last 12 months, totalling ${formatRupees(
              revenue.reduce((total, point) => total + point.value, 0),
            )}`}
            formatValue={(value) => formatRupees(value)}
            points={revenue.map((point) => ({ label: point.label, value: point.value }))}
          />
        </ChartCard>

        <ChartCard
          description="New registrations per day, IST."
          title={`Signups (30 days) · ${formatCount(signupsTotal)}`}
        >
          <BarsChart
            ariaLabel={`Daily signups for the last 30 days, ${signupsTotal} in total`}
            height={180}
            points={signups.map((point) => ({ label: point.label, values: [point.value] }))}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          description="Published jobs grouped by category."
          title="Jobs by category"
        >
          <DonutChart
            centerLabel="published jobs"
            centerValue={formatCount(categoryTotal)}
            slices={categorySlices.map((slice, index) => ({
              label: slice.label,
              value: slice.value,
              color: CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0],
            }))}
          />
        </ChartCard>

        <SectionCard
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/admin/audit"
            >
              View all
            </Link>
          }
          bodyClassName="divide-y divide-slate-100"
          title="Recent activity"
        >
          {activity.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">
              No audit entries yet. Actions taken by admins and employers will appear here.
            </p>
          ) : (
            <ul>
              {activity.map((entry) => (
                <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0" key={entry.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy">
                      {entry.description ?? entry.action}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.actorName ?? entry.actorRole ?? "System"} ·{" "}
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
                        {entry.action}
                      </code>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {timeAgo(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Needs attention */}
      <SectionCard
        action={
          <Link
            className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
            href="/admin/jobs"
          >
            Review jobs
          </Link>
        }
        description="Held jobs with scan notes, open reports and assistant threads flagged for a human."
        title="Needs attention"
      >
        {attention.length === 0 ? (
          <EmptyState
            description="Held jobs, moderation reports and assistant threads that need a human will show up here."
            icon={<CircleAlert className="h-10 w-10" aria-hidden="true" />}
            title="Nothing needs attention"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {attention.map((item) => (
              <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" key={item.key}>
                <StatusChip tone={ATTENTION_TONE[item.kind]}>
                  {ATTENTION_LABEL[item.kind]}
                </StatusChip>
                <div className="min-w-0 flex-1">
                  <Link
                    className="block truncate text-sm font-semibold text-navy hover:text-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                    href={item.href}
                  >
                    {item.title}
                  </Link>
                  <p className="truncate text-xs text-slate-500">{item.meta}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {timeAgo(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Assistant + social status */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/admin/assistant"
            >
              Open Assistant
            </Link>
          }
          title="Assistant status"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusChip tone={assistant.aiEnabled ? "success" : "neutral"}>
                AI {assistant.aiEnabled ? "on" : "manual mode"}
              </StatusChip>
              <StatusChip tone="brand">
                {connectedAccounts.length} of {assistant.accounts.length} mail accounts
              </StatusChip>
            </div>

            <MetricRow
              href="/admin/assistant?status=open"
              label="Open threads"
              value={formatCount(assistant.openThreads)}
            />
            <MetricRow
              href="/admin/assistant?attention=true"
              label="Threads needing attention"
              value={formatCount(assistant.attentionThreads)}
            />
            <MetricRow
              href="/admin/assistant/leads"
              label="Leads contacted (last 7 days, IST)"
              value={formatCount(assistant.contactedThisWeek)}
            />
            <MetricRow
              href="/admin/assistant/leads?status=replied"
              label="Replies received (all time)"
              value={formatCount(assistant.repliesReceived)}
            />

            <div className="pt-1">
              <ProgressBar
                label={`AI spend this month: $${aiSpendUsd.toFixed(2)} of $${assistant.capUsd} cap`}
                percent={percentOf(aiSpendUsd, assistant.capUsd)}
                tone={assistant.capUsd > 0 && aiSpendUsd >= assistant.capUsd ? "danger" : "brand"}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          action={
            <Link
              className="text-sm font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
              href="/admin/social"
            >
              Social settings
            </Link>
          }
          title="Social auto-posting"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={social.enabled && !social.paused ? "success" : "neutral"}>
                {!social.enabled ? "Off" : social.paused ? "Paused" : "On"}
              </StatusChip>
              {social.connections.map((connection) => (
                <StatusChip key={connection.platform} tone={connection.configured ? "teal" : "warning"}>
                  {connection.platform === "facebook" ? "Facebook" : "Instagram"}
                  {connection.configured ? " ready" : " not configured"}
                </StatusChip>
              ))}
            </div>

            <MetricRow
              href="/admin/social"
              label="Queued posts"
              value={formatCount(social.queuedPosts)}
            />
            <MetricRow
              href="/admin/social"
              label="Published today (IST)"
              value={formatCount(social.publishedToday)}
            />
            <MetricRow
              href="/admin/social"
              label="Failed posts"
              value={formatCount(social.failedPosts)}
            />
            <MetricRow
              href="/admin/social/digest"
              label="WhatsApp digest today"
              value={social.digestPostedToday ? "Posted" : "Not posted yet"}
            />

            {social.lastError ? (
              <p className="truncate rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                Last error: {social.lastError}
              </p>
            ) : null}

            <p className="flex items-center gap-2 pt-1 text-xs text-slate-500">
              <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Promotion only ever uses public job fields - never candidate data.
            </p>
          </div>
        </SectionCard>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Need something custom? Email{" "}
        <a className="font-semibold text-royal hover:underline" href="mailto:support@ravelyth.com">
          support@ravelyth.com
        </a>{" "}
        or use <Mail className="h-3.5 w-3.5" aria-hidden="true" /> the support inbox.
      </p>
    </div>
  );
}
