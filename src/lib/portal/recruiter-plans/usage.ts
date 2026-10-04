import { normalizeJobPostAllowance } from './catalog';

/**
 * Job-post allowance arithmetic.
 *
 * Kept pure and separate from the database so the exact rule that decides
 * "may this company post another job?" can be unit-tested without a database,
 * and so the API, the dashboard and the emails all report the SAME numbers.
 */

export type UsageLevel = 'ok' | 'warning' | 'exhausted';

export interface AllowanceUsage {
  /** Posts included in the current billing period. */
  allowance: number;
  /** Posts already consumed in this period. */
  used: number;
  /** Posts still available. Never negative. */
  remaining: number;
  /** 0–100, rounded. */
  percentUsed: number;
  level: UsageLevel;
}

/** Usage at or above this fraction is reported as "approaching the limit". */
export const USAGE_WARNING_THRESHOLD = 0.8;

/**
 * Computes usage for a plan allowance.
 *
 * `used` is clamped to `allowance` for display purposes so a downgrade that
 * leaves a company over its new limit still shows a sane 100% rather than
 * "12 of 5 used (240%)", while `remaining` correctly reports 0.
 */
export function computeAllowanceUsage(input: {
  allowance: number | null | undefined;
  used: number;
  warningThreshold?: number;
}): AllowanceUsage {
  const allowance = normalizeJobPostAllowance(input.allowance);
  const used = Math.max(0, Math.floor(input.used));
  const remaining = Math.max(0, allowance - used);
  const threshold = input.warningThreshold ?? USAGE_WARNING_THRESHOLD;
  const ratio = allowance > 0 ? used / allowance : 1;

  const level: UsageLevel = remaining <= 0 ? 'exhausted' : ratio >= threshold ? 'warning' : 'ok';

  return {
    allowance,
    used,
    remaining,
    percentUsed: Math.min(100, Math.round(ratio * 100)),
    level,
  };
}

/**
 * Whether another post is allowed.
 *
 * `allowanceRemaining` and `availableCredits` are two independent sources:
 * the monthly allowance that comes with the plan, and prepaid job credits.
 * A post is permitted when EITHER has room, and the caller decides which one to
 * spend — allowance first, credits as the overflow.
 */
export function canConsumePost(input: {
  allowanceRemaining: number;
  availableCredits: number;
}): boolean {
  return input.allowanceRemaining > 0 || input.availableCredits > 0;
}

/**
 * The message shown when both sources are exhausted. It names the numbers so
 * the recruiter knows exactly where they stand, rather than being told that
 * "something went wrong".
 */
export function limitReachedMessage(input: {
  planName: string | null;
  allowance: number;
}): string {
  const plan = input.planName ? `Your ${input.planName} plan` : 'Your current plan';
  return `${plan} includes ${input.allowance} job post${
    input.allowance === 1 ? '' : 's'
  } per billing period, and you have used all of them. Upgrade your plan or buy additional job credits to post another vacancy.`;
}
