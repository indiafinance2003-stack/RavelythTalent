import {
  APPLICATION_STATUSES,
  COMPANY_VERIFICATION_STATUSES,
  EMPLOYMENT_TYPES,
  JOB_ALERT_FREQUENCIES,
  JOB_STATUSES,
  LANGUAGE_PROFICIENCIES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PROFILE_VISIBILITIES,
  SKILL_PROFICIENCIES,
  SUBSCRIPTION_STATUSES,
  WORK_MODES,
  type ApplicationStatus,
  type JobStatus,
} from '@/lib/db/portal-schema';

/**
 * Presentation-independent vocabulary for Ravelyth Talent.
 *
 * Labels are pure functions with no data access, so they are safe to import
 * from any layer (route handler, service, or a future frontend component)
 * without pulling in server-only modules.
 */

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  published: 'Published',
  closed: 'Closed',
  expired: 'Expired',
  rejected: 'Rejected',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  selected: 'Selected',
  rejected: 'Rejected',
  hired: 'Hired',
};

export const EMPLOYMENT_TYPE_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
};

export const WORK_MODE_LABELS: Record<(typeof WORK_MODES)[number], string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export const SKILL_PROFICIENCY_LABELS: Record<(typeof SKILL_PROFICIENCIES)[number], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

export const LANGUAGE_PROFICIENCY_LABELS: Record<
  (typeof LANGUAGE_PROFICIENCIES)[number],
  string
> = {
  basic: 'Basic',
  conversational: 'Conversational',
  professional: 'Professional',
  fluent: 'Fluent',
  native: 'Native',
};

export const PROFILE_VISIBILITY_LABELS: Record<(typeof PROFILE_VISIBILITIES)[number], string> = {
  public: 'Visible to everyone',
  employers: 'Visible to verified employers only',
  private: 'Not listed publicly',
};

export const ORDER_STATUS_LABELS: Record<(typeof ORDER_STATUSES)[number], string> = {
  created: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const PAYMENT_STATUS_LABELS: Record<(typeof PAYMENT_STATUSES)[number], string> = {
  created: 'Created',
  authorized: 'Authorized',
  captured: 'Captured',
  failed: 'Failed',
  refunded: 'Refunded',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<(typeof SUBSCRIPTION_STATUSES)[number], string> = {
  pending: 'Pending',
  active: 'Active',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const ALERT_FREQUENCY_LABELS: Record<(typeof JOB_ALERT_FREQUENCIES)[number], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
};

export const COMPANY_VERIFICATION_LABELS: Record<
  (typeof COMPANY_VERIFICATION_STATUSES)[number],
  string
> = {
  pending: 'Awaiting verification',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export function jobStatusLabel(value: string): string {
  return isJobStatus(value) ? JOB_STATUS_LABELS[value] : value;
}

export function applicationStatusLabel(value: string): string {
  return isApplicationStatus(value) ? APPLICATION_STATUS_LABELS[value] : value;
}

export function employmentTypeLabel(value: string): string {
  return EMPLOYMENT_TYPE_LABELS[value as (typeof EMPLOYMENT_TYPES)[number]] ?? value;
}

export function workModeLabel(value: string): string {
  return WORK_MODE_LABELS[value as (typeof WORK_MODES)[number]] ?? value;
}

/**
 * Formats a money amount stored in minor units for display.
 * Returns null when the amount is absent so callers can hide the field rather
 * than render a misleading "₹0".
 */
export function formatMoneyMinor(amountMinor: number | null | undefined): string | null {
  if (amountMinor === null || amountMinor === undefined) return null;
  const major = amountMinor / 100;
  return `₹${major.toLocaleString('en-IN')}`;
}

/** Formats an annual salary band, e.g. "₹5,00,000 – ₹9,00,000". */
export function formatSalaryBand(
  minMinor: number | null | undefined,
  maxMinor: number | null | undefined
): string | null {
  const min = formatMoneyMinor(minMinor);
  const max = formatMoneyMinor(maxMinor);
  if (min && max) return `${min} – ${max}`;
  return min ?? max ?? null;
}

/** Formats an experience band, e.g. "3–5 years" / "2+ years". */
export function formatExperienceBand(
  minYears: number | null | undefined,
  maxYears: number | null | undefined
): string | null {
  if (minYears === null || minYears === undefined) {
    if (maxYears === null || maxYears === undefined) return null;
    return `Up to ${maxYears} years`;
  }
  if (maxYears === null || maxYears === undefined) return `${minYears}+ years`;
  if (minYears === maxYears) return `${minYears} years`;
  return `${minYears}–${maxYears} years`;
}
