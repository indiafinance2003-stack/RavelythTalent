import 'server-only';
import { sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { rowsFromExecute } from '@/lib/db/rows';

/**
 * Platform administration (see §19).
 *
 * EVERY function here is a data/permission operation that a route handler may
 * only reach AFTER `requireAdmin()` has passed. Nothing in this module trusts a
 * role, user id or company id supplied by the client: the acting admin is passed
 * in explicitly by the guard, and the targets are looked up server-side.
 *
 * Suspending an account, changing a role, adjusting credits and resolving a
 * report are all audited.
 */

/** Roles an admin may assign. Platform owners are never assignable. */
export const ASSIGNABLE_ROLES = ['candidate', 'employer', 'customer'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface PlatformStats {
  candidates: number;
  employers: number;
  companies: number;
  verifiedCompanies: number;
  activeJobs: number;
  pendingApprovalJobs: number;
  totalApplications: number;
  hires: number;
  paidOrders: number;
  revenueMinor: number;
  activePackages: number;
  activePremiumSubscriptions: number;
  openReports: number;
  suspendedUsers: number;
}

/**
 * Platform statistics for the admin dashboard.
 *
 * Every figure is computed by the database with aggregate queries (no loading
 * tables into memory), so the dashboard stays fast as the platform grows.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const { db } = dbFromRequest();

  // `db.execute()` resolves to a row array, but the exact shape differs by
  // driver, so every result is read through `rowsFromExecute` below.
  const userCounts = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE role = 'candidate')::int AS candidates,
      count(*) FILTER (WHERE role = 'employer')::int AS employers,
      count(*) FILTER (WHERE account_status = 'suspended')::int AS suspended_users
    FROM users
  `);

  const companyCounts = await db.execute(sql`
    SELECT
      count(*)::int AS companies,
      count(*) FILTER (WHERE verification_status = 'verified')::int AS verified_companies
    FROM companies
  `);

  const jobCounts = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'published')::int AS active_jobs,
      count(*) FILTER (WHERE status = 'pending_approval')::int AS pending_approval_jobs
    FROM jobs
  `);

  const applicationCounts = await db.execute(sql`
    SELECT
      count(*)::int AS total_applications,
      count(*) FILTER (WHERE status = 'hired')::int AS hires
    FROM job_applications
  `);

  const orderCounts = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'paid')::int AS paid_orders,
      COALESCE(SUM(amount_minor) FILTER (WHERE status = 'paid'), 0)::int AS revenue_minor
    FROM orders
  `);

  const packageCounts = await db.execute(sql`
    SELECT count(*) FILTER (WHERE status = 'active')::int AS active_packages
    FROM job_packages
  `);

  const premiumCounts = await db.execute(sql`
    SELECT count(*) FILTER (WHERE status = 'active')::int AS active_premium
    FROM candidate_premium_subscriptions
  `);

  const reportCounts = await db.execute(sql`
    SELECT count(*) FILTER (WHERE status = 'open')::int AS open_reports FROM reports
  `);

  const pick = <T>(result: unknown): T =>
    (rowsFromExecute<T>(result)[0] ?? {}) as T;

  const u = pick<Record<string, number>>(userCounts);
  const c = pick<Record<string, number>>(companyCounts);
  const j = pick<Record<string, number>>(jobCounts);
  const a = pick<Record<string, number>>(applicationCounts);
  const o = pick<Record<string, number>>(orderCounts);
  const p = pick<Record<string, number>>(packageCounts);
  const pr = pick<Record<string, number>>(premiumCounts);
  const rp = pick<Record<string, number>>(reportCounts);

  return {
    candidates: u.candidates ?? 0,
    employers: u.employers ?? 0,
    companies: c.companies ?? 0,
    verifiedCompanies: c.verified_companies ?? 0,
    activeJobs: j.active_jobs ?? 0,
    pendingApprovalJobs: j.pending_approval_jobs ?? 0,
    totalApplications: a.total_applications ?? 0,
    hires: a.hires ?? 0,
    paidOrders: o.paid_orders ?? 0,
    revenueMinor: o.revenue_minor ?? 0,
    activePackages: p.active_packages ?? 0,
    activePremiumSubscriptions: pr.active_premium ?? 0,
    openReports: rp.open_reports ?? 0,
    suspendedUsers: u.suspended_users ?? 0,
  };
}

/* ==========================================================================
 * Daily activity series, for the admin dashboard trend charts.
 * ========================================================================== */

export interface DailyPoint {
  day: string;
  value: number;
}

/**
 * Counts applications per day over a window, computed in the database.
 * A scheduled worker is NOT required for this: it is a live aggregate.
 */
export async function getApplicationSeries(days = 30): Promise<DailyPoint[]> {
  const { db } = dbFromRequest();
  const window = Math.min(Math.max(days, 1), 365);

  const result = await db.execute(sql`
    SELECT to_char(date_trunc('day', applied_at), 'YYYY-MM-DD') AS day,
           count(*)::int AS value
      FROM job_applications
     WHERE applied_at >= now() - (${window} * interval '1 day')
     GROUP BY 1
     ORDER BY 1
  `);

  return rowsFromExecute<{ day: string; value: number }>(result);
}

/** Counts registrations per day by role, for growth reporting. */
export async function getRegistrationSeries(days = 30): Promise<
  Array<{ day: string; role: string; value: number }>
> {
  const { db } = dbFromRequest();
  const window = Math.min(Math.max(days, 1), 365);

  const result = await db.execute(sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           role,
           count(*)::int AS value
      FROM users
     WHERE created_at >= now() - (${window} * interval '1 day')
     GROUP BY 1, 2
     ORDER BY 1
  `);

  return rowsFromExecute<{ day: string; role: string; value: number }>(result);
}
