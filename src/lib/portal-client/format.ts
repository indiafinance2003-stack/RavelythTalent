import type {
  ApplicationStatus,
  EmploymentType,
  JobStatus,
  OrderStatus,
  WorkMode,
} from './types';

/**
 * Display helpers shared across the portal UI.
 *
 * Money is stored as integer MINOR units (paise) everywhere. It is only ever
 * divided here, for display, so no component can accidentally send a formatted
 * string such as "₹9,900" to an endpoint that expects a number.
 */

/** Renders minor units as a rupee amount. */
export function formatMoney(minor: number | null | undefined, currency = 'INR'): string {
  if (minor === null || minor === undefined) return 'Not disclosed';
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Parses a user-typed rupee amount into integer minor units.
 * Returns null when the input is not a usable number, so the caller can show a
 * validation error instead of silently charging zero.
 */
export function parseMoneyToMinor(input: string): number | null {
  // A leading or trailing minus is rejected outright rather than stripped.
  // Silently turning "-50" into 5000 would let a stray sign, or a credit note
  // pasted as "-₹50", become a positive price with no warning to the user.
  if (/[-−]/.test(input)) return null;

  const cleaned = input.replace(/[^0-9.]/g, '');
  if (cleaned.length === 0) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Converts minor units to a plain editable string (no symbol, no separators). */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '';
  const amount = minor / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** Converts a minor-unit salary band into one display string. */
export function formatSalaryBand(
  min: number | null,
  max: number | null,
  isPublic: boolean,
  currency = 'INR'
): string {
  if (!isPublic || (min === null && max === null)) return 'Salary not disclosed';
  if (min !== null && max !== null) return `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
  if (min !== null) return `From ${formatMoney(min, currency)}`;
  return `Up to ${formatMoney(max, currency)}`;
}

/** "3 – 6 yrs", "2+ yrs", or null when the employer left it blank. */
export function formatExperienceBand(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min} – ${max} yrs`;
  if (min !== null) return `${min}+ yrs`;
  return `Up to ${max} yrs`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Relative time for notification and application lists. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  onsite: 'On site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending review',
  published: 'Live',
  closed: 'Closed',
  expired: 'Expired',
  rejected: 'Needs changes',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  selected: 'Selected',
  rejected: 'Not selected',
  hired: 'Hired',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  created: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/**
 * Tailwind tone per job status.
 *
 * Deliberately not colour alone: every badge also carries its label, so the
 * state is legible without relying on hue.
 */
export const JOB_STATUS_TONES: Record<JobStatus, string> = {
  draft: 'bg-slate-800 text-slate-300 ring-slate-600',
  pending_approval: 'bg-amber-500/10 text-amber-300 ring-amber-500/40',
  published: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40',
  closed: 'bg-slate-800 text-slate-400 ring-slate-700',
  expired: 'bg-slate-800 text-slate-400 ring-slate-700',
  rejected: 'bg-red-500/10 text-red-300 ring-red-500/40',
};

export const APPLICATION_STATUS_TONES: Record<ApplicationStatus, string> = {
  applied: 'bg-slate-800 text-slate-300 ring-slate-600',
  shortlisted: 'bg-sky-500/10 text-sky-300 ring-sky-500/40',
  interview: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/40',
  selected: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40',
  rejected: 'bg-slate-800 text-slate-400 ring-slate-700',
  hired: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/50',
};

export const VERIFICATION_LABELS: Record<string, string> = {
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

/** Human label for a candidate profile field name from `completion.missing`. */
export function completionLabel(field: string): string {
  const labels: Record<string, string> = {
    headline: 'Professional headline',
    summary: 'Professional summary',
    location: 'Location',
    phone: 'Phone number',
    currentJobTitle: 'Current job title',
    totalExperienceYears: 'Total experience',
    expectedCtcMinor: 'Expected salary',
    linkedinUrl: 'LinkedIn profile',
    skills: 'At least one skill',
    education: 'Education history',
    experience: 'Work experience',
    resume: 'A resume',
  };
  return labels[field] ?? titleCase(field);
}

/** Consent purposes the UI can display, in a deliberate, readable order. */
export const CONSENT_LABELS: Record<string, string> = {
  account_creation: 'Account creation',
  job_application: 'Job applications',
  resume_storage: 'Resume storage',
  employer_sharing: 'Sharing with employers',
  recruitment_services: 'Ravelyth recruitment services',
  marketing: 'Marketing email',
};
