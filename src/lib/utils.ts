/** Small client-safe helpers shared across the app. */

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/** Append a short random suffix to keep slugs unique. */
export function uniqueSlug(input: string): string {
  const base = slugify(input) || "item";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/* Money & numbers                                                            */
/* -------------------------------------------------------------------------- */

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export function formatPaise(
  paise: number | null | undefined,
  opts: { withDecimals?: boolean } = {},
): string {
  if (paise === null || paise === undefined) return "—";
  const value = paiseToRupees(paise);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts.withDecimals ? 2 : 0,
    maximumFractionDigits: opts.withDecimals ? 2 : 0,
  }).format(value);
}

export const SALARY_PERIOD_LABEL: Record<string, string> = {
  year: "per year",
  month: "per month",
  day: "per day",
  hour: "per hour",
};

export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  period = "year",
  hidden = false,
): string {
  if (hidden) return "Not disclosed";
  if (!min && !max) return "Not disclosed";
  if (min && max && min !== max) {
    return `${formatPaise(min)} - ${formatPaise(max)} ${
      SALARY_PERIOD_LABEL[period] ?? ""
    }`.trim();
  }
  const single = min ?? max ?? 0;
  return `${formatPaise(single)} ${SALARY_PERIOD_LABEL[period] ?? ""}`.trim();
}

export function formatExperience(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): string {
  const lo = min === null || min === undefined ? null : Number(min);
  const hi = max === null || max === undefined ? null : Number(max);
  if (lo === null && hi === null) return "Any experience";
  if (lo !== null && hi !== null) {
    if (lo === 0 && hi === 0) return "Fresher";
    return `${lo} - ${hi} yrs`;
  }
  if (lo !== null) return lo === 0 ? "Fresher" : `${lo}+ yrs`;
  return `Up to ${hi} yrs`;
}

export function formatMonthsAsExperience(months: number | null | undefined): string {
  if (!months || months <= 0) return "Fresher";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} mo`;
  if (rest === 0) return `${years} yr${years > 1 ? "s" : ""}`;
  return `${years} yr${years > 1 ? "s" : ""} ${rest} mo`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: Date | string | null | undefined): string {
  return formatIndianDateTime(value);
}

export function formatIndianDateTime(
  value: Date | string | null | undefined,
): string {
  const d = toDate(value);
  if (!d) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(d);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueFor("day")} ${valueFor("month")} ${valueFor("year")}, ${valueFor("hour")}:${valueFor("minute")} ${valueFor("dayPeriod").toLowerCase()} IST`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  return formatIndianDateTime(value);
}

export function timeAgo(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

export function daysUntil(value: Date | string | null | undefined): number {
  const d = toDate(value);
  if (!d) return 0;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

export const JOB_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
  freelance: "Freelance",
};

export const WORK_MODE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  viewed: "Viewed",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const COMPANY_STATUS_LABEL: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export const JOB_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  published: "Published",
  rejected: "Rejected",
  paused: "Paused",
  closed: "Closed",
  expired: "Expired",
};

export function labelFor(
  map: Record<string, string>,
  key: string | null | undefined,
  fallback = "—",
): string {
  if (!key) return fallback;
  return map[key] ?? key;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

export function truncate(input: string, max = 160): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1).trimEnd()}…`;
}

/** Escapes raw HTML so untrusted text can never be injected as markup. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null | string[]>,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    } else {
      sp.set(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

