import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  companyMembers,
  jobs,
  planFeatures,
  plans,
  subscriptions,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

/**
 * Central server-side entitlement + quota enforcement.
 *
 * Every paid capability is checked here and nowhere else, so a plan change
 * takes effect everywhere at once. Features live in `plan_features`;
 * `limit_value = NULL` means "unlimited".
 */

export type FeatureKey =
  | "job_posts_per_month"
  | "applicant_management"
  | "bulk_actions"
  | "company_page"
  | "company_verification"
  | "candidate_search"
  | "resume_database"
  | "saved_candidates"
  | "shortlisting"
  | "interview_management"
  | "team_management"
  | "reports_basic"
  | "reports_enhanced"
  | "reports_advanced"
  | "priority_support"
  | "resume_builder"
  | "resume_templates"
  | "resume_versions"
  | "job_alerts"
  | "apply_to_jobs"
  | "resume_upload"
  | "saved_jobs"
  | "application_tracking"
  | "resume_database_visibility"
  | (string & {});

export type Entitlement = { enabled: boolean; limit: number | null };

export type ActivePlan = {
  subscriptionId: string;
  planId: string;
  planCode: string;
  planName: string;
  jobPostsPerMonth: number | null;
  currentPeriodEnd: Date;
  features: Map<FeatureKey, Entitlement>;
};

export function emptyEntitlements(): Map<FeatureKey, Entitlement> {
  return new Map();
}

async function loadPlanById(planId: string): Promise<ActivePlan | null> {
  const rows = await db
    .select({
      subscriptionId: subscriptions.id,
      planId: subscriptions.planId,
      planCode: plans.code,
      planName: plans.name,
      jobPostsPerMonth: plans.jobPostsPerMonth,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.planId, planId),
        eq(subscriptions.status, "active"),
        lte(subscriptions.startedAt, new Date()),
        sql`${subscriptions.currentPeriodEnd} > now()`,
      ),
    )
    .limit(1);

  const row = rows.at(0);
  if (!row) return null;

  const featureRows = await db
    .select({
      featureKey: planFeatures.featureKey,
      isEnabled: planFeatures.isEnabled,
      limitValue: planFeatures.limitValue,
    })
    .from(planFeatures)
    .where(eq(planFeatures.planId, row.planId));

  return {
    ...row,
    features: new Map(
      featureRows.map((f) => [
        f.featureKey,
        { enabled: f.isEnabled, limit: f.limitValue },
      ]),
    ),
  };
}

/** Most recently ending active subscription for a company, if any. */
export async function getCompanyPlan(companyId: string): Promise<ActivePlan | null> {
  const rows = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.companyId, companyId),
        eq(subscriptions.status, "active"),
        sql`${subscriptions.currentPeriodEnd} > now()`,
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  const planId = rows.at(0)?.planId;
  return planId ? loadPlanById(planId) : null;
}

/** Active candidate (B2C) subscription for a user. */
export async function getUserPlan(userId: string): Promise<ActivePlan | null> {
  const rows = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        isNull(subscriptions.companyId),
        eq(subscriptions.status, "active"),
        sql`${subscriptions.currentPeriodEnd} > now()`,
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  const planId = rows.at(0)?.planId;
  return planId ? loadPlanById(planId) : null;
}

/**
 * Candidate entitlement check. Without a subscription a candidate gets the
 * seeded `candidate_free` feature set, so the gates stay in one place.
 */
export async function getCandidateEntitlements(
  userId: string,
): Promise<Map<FeatureKey, Entitlement>> {
  const plan = await getUserPlan(userId);
  if (plan) return plan.features;

  const freeRows = await db
    .select({
      featureKey: planFeatures.featureKey,
      isEnabled: planFeatures.isEnabled,
      limitValue: planFeatures.limitValue,
    })
    .from(planFeatures)
    .innerJoin(plans, eq(plans.id, planFeatures.planId))
    .where(and(eq(plans.code, "candidate_free"), eq(plans.isActive, true)));

  return new Map(
    freeRows.map((f) => [
      f.featureKey,
      { enabled: f.isEnabled, limit: f.limitValue },
    ]),
  );
}

function assertFeature(
  features: Map<FeatureKey, Entitlement>,
  feature: FeatureKey,
): Entitlement {
  const found = features.get(feature);
  if (!found || !found.enabled) {
    throw new AppError(
      "Your current plan does not include this feature.",
      403,
      "feature_not_in_plan",
    );
  }
  return found;
}

export async function requireUserFeature(
  userId: string,
  feature: FeatureKey,
): Promise<Entitlement> {
  return assertFeature(await getCandidateEntitlements(userId), feature);
}

export async function requireCompanyFeature(
  companyId: string,
  feature: FeatureKey,
): Promise<Entitlement> {
  const plan = await getCompanyPlan(companyId);
  return assertFeature(plan?.features ?? emptyEntitlements(), feature);
}

export async function hasCompanyFeature(
  companyId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const plan = await getCompanyPlan(companyId);
  return Boolean(plan?.features.get(feature)?.enabled);
}

/* -------------------------------------------------------------------------- */
/* Company membership                                                          */
/* -------------------------------------------------------------------------- */

/** Throws unless the user is an active member of the company (admins pass). */
export async function requireCompanyMembership(
  userId: string,
  companyId: string,
  role?: "owner" | "admin" | "recruiter",
): Promise<{ role: string }> {
  const rows = await db
    .select({ role: companyMembers.role, status: companyMembers.status })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId),
      ),
    )
    .limit(1);

  const membership = rows.at(0);
  if (!membership || membership.status !== "active") {
    throw new AppError("You do not have access to this company.", 403, "not_a_member");
  }
  if (role && membership.role !== role && membership.role !== "owner") {
    throw new AppError(
      "You need a higher role to do that.",
      403,
      "insufficient_role",
    );
  }
  return { role: membership.role };
}

/** All companies the user actively belongs to. */
export async function listUserCompanies(
  userId: string,
): Promise<Array<{ id: string; name: string; slug: string; status: string; role: string }>> {
  const rows = await db
    .select({
      id: companyMembers.companyId,
      name: companies.name,
      slug: companies.slug,
      status: companies.status,
      role: companyMembers.role,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.status, "active"),
      ),
    )
    .orderBy(desc(companyMembers.createdAt));

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Job-post quota                                                             */
/* -------------------------------------------------------------------------- */

/** Calendar-month bucket, e.g. "2026-04". Resets on the 1st of each month. */
export function quotaPeriodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function quotaPeriodLabel(date = new Date()): string {
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export type JobQuota = {
  periodKey: string;
  periodLabel: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number;
  planName: string | null;
  planId: string | null;
};

export async function getJobQuota(companyId: string): Promise<JobQuota> {
  const periodKey = quotaPeriodKey();
  const plan = await getCompanyPlan(companyId);
  const limit = plan?.jobPostsPerMonth ?? null;

  // Drafts never consume quota; only submitted/modated postings count.
  const usedRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, companyId),
        eq(jobs.quotaPeriodKey, periodKey),
        isNull(jobs.deletedAt),
        sql`${jobs.status} <> 'draft'`,
      ),
    );

  const used = usedRows.at(0)?.count ?? 0;

  return {
    periodKey,
    periodLabel: quotaPeriodLabel(),
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    percentUsed: limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100)),
    planName: plan?.planName ?? null,
    planId: plan?.planId ?? null,
  };
}

export type QuotaDecision =
  | { allowed: true; quota: JobQuota }
  | { allowed: false; quota: JobQuota; reason: string };

/** Server-side gate applied before a job is submitted for approval. */
export async function checkJobQuota(companyId: string): Promise<QuotaDecision> {
  const quota = await getJobQuota(companyId);

  if (quota.limit === null) {
    return {
      allowed: false,
      quota,
      reason: "You need an active employer plan before you can post jobs.",
    };
  }
  if (quota.used >= quota.limit) {
    return {
      allowed: false,
      quota,
      reason: `You have used all ${quota.limit} job posts included in your plan for ${quota.periodLabel}.`,
    };
  }
  return { allowed: true, quota };
}