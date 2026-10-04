/**
 * Recruiter plan catalogue: the locked launch pricing and the safety rules
 * around it.
 *
 * The values here are the SEED for the `recruiter_plans` table (the migration
 * inserts exactly these), and the fallback used for display when a deployment
 * has not yet been seeded. They are not read to decide what a customer pays:
 * the amount charged always comes from the stored plan row, so an admin edit
 * takes effect immediately and cannot be bypassed from the browser.
 *
 * No data access lives here, so pricing pages and report screens can share one
 * definition of the catalogue.
 */

import type { PlanBillingPeriod } from '@/lib/db/portal-schema';

export interface RecruiterPlanSeed {
  code: string;
  name: string;
  description: string;
  /** Integer minor units (paise). */
  priceMonthlyMinor: number;
  priceAnnualMinor: number;
  jobPostsPerMonth: number;
  supportTier: 'standard' | 'priority';
  isEnterprise: boolean;
  sortOrder: number;
  /** Cumulative capability list — each tier includes every lower tier. */
  features: readonly string[];
}

const BASIC_FEATURES = [
  'job_posting',
  'company_profile',
  'applications',
  'candidate_management',
  'notifications',
];

const PROFESSIONAL_FEATURES = [
  ...BASIC_FEATURES,
  'advanced_candidate_search',
  'resume_database',
  'shortlisting',
  'saved_candidates',
  'interview_management',
  'reports',
];

const BUSINESS_FEATURES = [...PROFESSIONAL_FEATURES, 'team_management', 'advanced_analytics'];

const ENTERPRISE_FEATURES = [...BUSINESS_FEATURES, 'priority_support'];

/**
 * The locked launch catalogue.
 *
 * BASIC       ₹3,999/month  ₹30,000/year   5 posts/month
 * PROFESSIONAL ₹7,999/month ₹50,000/year  15 posts/month
 * BUSINESS    ₹12,999/month ₹70,000/year  25 posts/month
 * ENTERPRISE  ₹35,999/month ₹1,15,000/year 50 posts/month
 */
export const RECRUITER_PLAN_SEED: readonly RecruiterPlanSeed[] = [
  {
    code: 'basic',
    name: 'Basic',
    description: 'For a company hiring a few roles at a time.',
    priceMonthlyMinor: 399900,
    priceAnnualMinor: 3000000,
    jobPostsPerMonth: 5,
    supportTier: 'standard',
    isEnterprise: false,
    sortOrder: 10,
    features: BASIC_FEATURES,
  },
  {
    code: 'professional',
    name: 'Professional',
    description: 'For an active hiring team running several roles in parallel.',
    priceMonthlyMinor: 799900,
    priceAnnualMinor: 5000000,
    jobPostsPerMonth: 15,
    supportTier: 'standard',
    isEnterprise: false,
    sortOrder: 20,
    features: PROFESSIONAL_FEATURES,
  },
  {
    code: 'business',
    name: 'Business',
    description: 'For companies with a continuous hiring pipeline.',
    priceMonthlyMinor: 1299900,
    priceAnnualMinor: 7000000,
    jobPostsPerMonth: 25,
    supportTier: 'standard',
    isEnterprise: false,
    sortOrder: 30,
    features: BUSINESS_FEATURES,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'For large and multi-team recruitment operations.',
    priceMonthlyMinor: 3599900,
    priceAnnualMinor: 11500000,
    jobPostsPerMonth: 50,
    supportTier: 'priority',
    isEnterprise: true,
    sortOrder: 40,
    features: ENTERPRISE_FEATURES,
  },
];

export function recruiterPlanSeed(code: string): RecruiterPlanSeed | null {
  return RECRUITER_PLAN_SEED.find((plan) => plan.code === code) ?? null;
}

/**
 * Allowance safety bounds.
 *
 * An allowance is a real number of posts, never a sentinel for "unlimited".
 * A stored 0 or a negative value would silently mean "cannot post at all", so
 * it is clamped up to 1; an absurd value is clamped down so a typo cannot open
 * the portal to unlimited posting.
 */
export const MIN_JOB_POST_ALLOWANCE = 1;
export const MAX_JOB_POST_ALLOWANCE = 500;

/** Clamps a stored allowance into the safe range. */
export function normalizeJobPostAllowance(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MIN_JOB_POST_ALLOWANCE;
  const rounded = Math.floor(value);
  if (rounded < MIN_JOB_POST_ALLOWANCE) return MIN_JOB_POST_ALLOWANCE;
  if (rounded > MAX_JOB_POST_ALLOWANCE) return MAX_JOB_POST_ALLOWANCE;
  return rounded;
}

/**
 * End of a billing period.
 *
 * Calendar-based rather than "add 30 days", so a monthly subscription renews on
 * the same day of the following month instead of drifting earlier every cycle.
 * All arithmetic is UTC to avoid a local DST shift changing a renewal date.
 */
export function periodEndFrom(start: Date, period: PlanBillingPeriod): Date {
  const end = new Date(start.getTime());
  if (period === 'annual') {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    const day = end.getUTCDate();
    end.setUTCMonth(end.getUTCMonth() + 1);
    // 31 Jan + 1 month must land in February, not on 2 or 3 March.
    if (end.getUTCDate() < day) end.setUTCDate(0);
  }
  return end;
}

/** Length of a billing period in milliseconds (informational only). */
export function billingPeriodMs(period: PlanBillingPeriod): number {
  return period === 'annual' ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

export function billingPeriodLabel(period: string): string {
  return period === 'annual' ? 'Annual' : period === 'yearly' ? 'Yearly' : 'Monthly';
}

/** True when the value is one of the two supported billing periods. */
export function isPlanBillingPeriod(value: string): value is PlanBillingPeriod {
  return value === 'monthly' || value === 'annual';
}

/** Formats an integer minor-unit amount for display, e.g. "₹7,999". */
export function formatAmountMinor(amountMinor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(amountMinor) / 100);
}

/**
 * True when the buyer is moving UP the catalogue. Used to label a plan change
 * as an upgrade or a downgrade, never to make an authorisation decision.
 */
export function isUpgrade(fromSortOrder: number, toSortOrder: number): boolean {
  return toSortOrder > fromSortOrder;
}