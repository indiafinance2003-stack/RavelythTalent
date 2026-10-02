'use client';

import Link from 'next/link';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { DailyPoint, PlatformStats, RegistrationPoint } from '@/lib/portal-client/types';
import { formatMoney, titleCase } from '@/lib/portal-client/format';
import { Card, CardHeader, ErrorState, LoadingState, PageHeader } from '@/components/portal/ui';

/** One headline figure. */
function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}): React.ReactElement {
  const body = (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:border-accent/50">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * A text trend bar. Deliberately not a chart library: the numbers are a handful
 * of aggregates, and a dependency-free bar keeps the console auditable and
 * free of a client-side charting payload.
 */
function Series({
  points,
  label,
  colour,
}: {
  points: DailyPoint[];
  label: string;
  colour: string;
}): React.ReactElement {
  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No activity in this window.</p>;
  }
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-300">
        {label} <span className="text-slate-500">({points.length} days)</span>
      </p>
      <div className="flex h-24 items-end gap-0.5" role="img" aria-label={`${label} trend`}>
        {points.map((point) => (
          <div
            key={point.day}
            className={`flex-1 rounded-t ${colour}`}
            style={{ height: `${Math.max((point.value / max) * 100, 2)}%` }}
            title={`${point.day}: ${point.value}`}
          />
        ))}
      </div>
    </div>
  );
}

/** The admin landing page: platform-wide figures and queues needing attention. */
export function AdminDashboard(): React.ReactElement {
  const data = useAsync(
    () =>
      portalGet<{
        stats: PlatformStats;
        applicationSeries: DailyPoint[];
        registrationSeries: RegistrationPoint[];
      }>('/api/portal/admin/stats'),
    []
  );

  if (data.loading) return <LoadingState label="Loading platform statistics…" />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;

  const stats = data.data?.stats;
  if (!stats) return <ErrorState message="No statistics were returned." onRetry={data.reload} />;

  // Registrations arrive per role, so they are summed per day for the trend.
  const byDay = new Map<string, number>();
  for (const point of data.data?.registrationSeries ?? []) {
    byDay.set(point.day, (byDay.get(point.day) ?? 0) + point.value);
  }
  const registrations: DailyPoint[] = [...byDay.entries()]
    .map(([day, value]) => ({ day, value }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Platform overview"
        description="Every figure is an aggregate computed by the database."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Candidates" value={String(stats.candidates)} />
        <Stat label="Employers" value={String(stats.employers)} />
        <Stat
          label="Companies"
          value={`${stats.verifiedCompanies}/${stats.companies}`}
          href="/admin/companies"
        />
        <Stat label="Active jobs" value={String(stats.activeJobs)} href="/admin/jobs" />
        <Stat
          label="Applications"
          value={String(stats.totalApplications)}
          href="/admin/applications"
        />
        <Stat label="Hires" value={String(stats.hires)} />
        <Stat
          label="Paid orders"
          value={String(stats.paidOrders)}
          href="/admin/payments"
        />
        <Stat label="Revenue" value={formatMoney(stats.revenueMinor)} />
        <Stat
          label="Pending approvals"
          value={String(stats.pendingApprovalJobs)}
          href="/admin/jobs?status=pending_approval"
        />
        <Stat label="Open reports" value={String(stats.openReports)} href="/admin/reports" />
        <Stat
          label="Active premium"
          value={String(stats.activePremiumSubscriptions)}
          href="/admin/premium-plans"
        />
        <Stat
          label="Active packages"
          value={String(stats.activePackages)}
          href="/admin/packages"
        />
        <Stat label="Suspended users" value={String(stats.suspendedUsers)} href="/admin/users?status=suspended" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Applications per day" description="Last 30 days" />
          <div className="p-5">
            <Series
              points={data.data?.applicationSeries ?? []}
              label="Applications"
              colour="bg-accent/70"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Registrations per day" description="Last 30 days, all roles" />
          <div className="p-5">
            <Series points={registrations} label="Sign-ups" colour="bg-emerald-500/70" />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Console" />
        <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['/admin/users', 'Users'],
            ['/admin/companies', 'Companies and agencies'],
            ['/admin/jobs', 'Jobs and approvals'],
            ['/admin/applications', 'Applications'],
            ['/admin/payments', 'Orders and payments'],
            ['/admin/packages', 'Job packages'],
            ['/admin/premium-plans', 'Premium plans'],
            ['/admin/reports', 'Reports'],
            ['/admin/audit', 'Audit log'],
            ['/admin/settings', 'Platform settings'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-line px-3 py-2 text-sm text-slate-300 hover:border-accent/50 hover:text-ink"
            >
              {label}
            </Link>
          ))}
        </div>
      </Card>

      <p className="text-xs text-slate-600">
        Role in use: {titleCase('admin')}. Every action taken here is written to the audit log.
      </p>
    </div>
  );
}
