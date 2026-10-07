/** Pure display helpers shared by the admin, candidate and employer dashboards. */

/** Formats an integer with Indian digit grouping (12,34,567). */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );
}

/** Percentage of `part` in `total`, rounded, clamped to 0-100. 0 when total is 0. */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  const raw = (part / total) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export type StatTrend = {
  /** Absolute change (current - previous). */
  delta: number;
  /** Percentage change versus the previous value, or null when it is undefined. */
  percent: number | null;
  direction: "up" | "down" | "flat";
};

/**
 * Trend between a current and a previous measurement.
 * A previous value of 0 yields a null percentage (the change cannot be a ratio).
 */
export function trendOf(current: number, previous: number): StatTrend {
  const delta = current - previous;
  const percent =
    previous > 0 ? Math.round((delta / previous) * 100) : null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { delta, percent, direction };
}

/**
 * Labels for a deterministic match score bucket (see `computeJobMatch`).
 * Thresholds are documented in ASSUMPTIONS.md.
 */
export const MATCH_LABELS = [
  { min: 70, label: "Strong match" },
  { min: 50, label: "Good match" },
  { min: 30, label: "Match" },
] as const;

export function matchLabelFor(score: number): string | null {
  for (const bucket of MATCH_LABELS) {
    if (score >= bucket.min) return bucket.label;
  }
  return null;
}

/** "1 open", "2 open" style plural helper. */
export function plural(count: number, singular: string, pluralWord?: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : (pluralWord ?? `${singular}s`)}`;
}
