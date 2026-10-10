import { and, desc, eq, isNull, lte, sql, type SQLWrapper } from "drizzle-orm";
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
import { getSiteSettings } from "@/lib/settings";

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

/** SQL predicate for an unexpired candidate premium entitlement. */
export function activeCandidatePremiumSql(userId: SQLWrapper) {
  return sql<boolean>`exists (
    select 1
    from subscriptions premium_subscription
    inner join plans premium_plan on premium_plan.id = premium_subscription.plan_id
    inner join plan_features premium_feature on premium_feature.plan_id = premium_plan.id
    where premium_subscription.user_id = ${userId}
      and premium_subscription.company_id is null
      and premium_subscription.status = 'active'
      and premium_subscription.current_period_start <= now()
      and premium_subscription.current_period_end > now()
      and premium_plan.audience = 'candidate'
      and premium_feature.feature_key = 'resume_builder'
      and premium_feature.is_enabled = true
  )`;
}

async function loadPlanBySubscriptionId(subscriptionId: string): Promise<ActivePlan | null> {
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
        eq(subscriptions.id, subscriptionId),
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
    .select({ subscriptionId: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.companyId, companyId),
        eq(subscriptions.status, "active"),
        lte(subscriptions.startedAt, new Date()),
        sql`${subscriptions.currentPeriodEnd} > now()`,
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  const subscriptionId = rows.at(0)?.subscriptionId;
  return subscriptionId ? loadPlanBySubscriptionId(subscriptionId) : null;
}

/** Active candidate (B2C) subscription for a user. */
export async function getUserPlan(userId: string): Promise<ActivePlan | null> {
  const rows = await db
    .select({ subscriptionId: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        isNull(subscriptions.companyId),
        eq(subscriptions.status, "active"),
        lte(subscriptions.startedAt, new Date()),
        sql`${subscriptions.currentPeriodEnd} > now()`,
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  const subscriptionId = rows.at(0)?.subscriptionId;
  return subscriptionId ? loadPlanBySubscriptionId(subscriptionId) : null;
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
  usesFreeCredit: boolean;
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  warningThreshold: number;
};

export async function getJobQuota(companyId: string): Promise<JobQuota> {
  const periodKey = quotaPeriodKey();
  const plan = await getCompanyPlan(companyId);
  const usesPaidPlan = Boolean(plan && plan.planCode !== "employer_free");
  const [settings, companyRows] = await Promise.all([
    getSiteSettings(),
    db
      .select({ freeJobPostsUsed: companies.freeJobPostsUsed })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1),
  ]);
  const freeLimit = settings.freeJobPosts;
  const freeUsed = companyRows.at(0)?.freeJobPostsUsed ?? 0;

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

  const monthlyUsed = usedRows.at(0)?.count ?? 0;
  const usesFreeCredit = !usesPaidPlan;
  const used = usesFreeCredit ? freeUsed : monthlyUsed;
  const limit = usesPaidPlan ? plan?.jobPostsPerMonth ?? null : freeLimit;

  return {
    periodKey,
    periodLabel: usesFreeCredit ? "for the lifetime of this company" : quotaPeriodLabel(),
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    percentUsed: limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100)),
    planName: usesPaidPlan ? plan?.planName ?? null : "Free",
    planId: usesPaidPlan ? plan?.planId ?? null : null,
    usesFreeCredit,
    freeLimit,
    freeUsed,
    freeRemaining: Math.max(0, freeLimit - freeUsed),
    warningThreshold: settings.jobPostWarningThreshold,
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
      reason: quota.usesFreeCredit
        ? "Your company's free job posts have been used. Upgrade to a paid employer plan to post another job."
        : `You have used all ${quota.limit} job posts included in your plan for ${quota.periodLabel}.`,
    };
  }
  return { allowed: true, quota };
}

/* -------------------------------------------------------------------------- */
/* Internship quota (separate from the job quota and free-job credit)         */
/* -------------------------------------------------------------------------- */

export type InternshipQuota = {
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  /** Purchased credit balance for extra internship posts. */
  credits: number;
  /** Remaining posts the company may submit right now. */
  remaining: number;
};

export async function getInternshipQuota(
  companyId: string,
): Promise<InternshipQuota> {
  const [settings, company] = await Promise.all([
    getSiteSettings(),
    db
      .select({
        freeUsed: companies.freeInternshipPostsUsed,
        credits: companies.internshipPostCredits,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1),
  ]);
  const row = company.at(0);
  if (!row) {
    throw new AppError("Company not found.", 404, "company_not_found");
  }
  const freeLimit = Math.max(0, settings.freeInternshipPosts);
  const freeUsed = Math.min(row.freeUsed, freeLimit);
  const freeRemaining = Math.max(0, freeLimit - freeUsed);
  const credits = Math.max(0, row.credits);
  return {
    freeLimit,
    freeUsed,
    freeRemaining,
    credits,
    remaining: freeRemaining + credits,
  };
}

export async function checkInternshipQuota(
  companyId: string,
): Promise<{ allowed: boolean; quota: InternshipQuota; reason: string | null }> {
  const quota = await getInternshipQuota(companyId);
  if (quota.remaining <= 0) {
    return {
      allowed: false,
      quota,
      reason:
        "Your company has used all its free internship posts. Buy internship credits to post another internship.",
    };
  }
  return { allowed: true, quota, reason: null };
}