import { addIstDays, istDateKey, istParts } from "@/lib/dashboard/ist";

/** One point on a dashboard chart: a stable key, a display label and a value. */
export type SeriesPoint = { key: string; label: string; value: number };

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * Builds a dense daily series (IST days) ending today IST, filling gaps with 0
 * so charts never skip a bar when the database has no rows for a day.
 */
export function fillDailySeries(
  days: number,
  now: Date,
  values: Record<string, number>,
): SeriesPoint[] {
  const count = Math.max(1, Math.floor(days));
  const points: SeriesPoint[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = addIstDays(now, -offset);
    const key = istDateKey(day);
    const [year, month, date] = key.split("-").map(Number) as [number, number, number];
    points.push({
      key,
      label: DAY_FORMAT.format(new Date(Date.UTC(year, month - 1, date))),
      value: values[key] ?? 0,
    });
  }
  return points;
}

/**
 * Builds a dense monthly series (IST calendar months) ending the current IST
 * month, labelled "Mar" or "Mar '25" when the year differs from this one.
 */
export function fillMonthlySeries(
  months: number,
  now: Date,
  values: Record<string, number>,
): SeriesPoint[] {
  const count = Math.max(1, Math.floor(months));
  const parts = istParts(now);
  const points: SeriesPoint[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const zeroBased = parts.month - 1 - back;
    const year = parts.year + Math.floor(zeroBased / 12);
    const month = ((zeroBased % 12) + 12) % 12;
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    points.push({
      key,
      label: monthLabel(year, month, parts.year),
      value: values[key] ?? 0,
    });
  }
  return points;
}

function monthLabel(year: number, month: number, currentYear: number): string {
  const text = new Intl.DateTimeFormat("en-IN", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));
  return year === currentYear ? text : `${text} '${String(year).slice(2)}`;
}

/** Sums a series into a single total. */
export function sumSeries(points: SeriesPoint[]): number {
  return points.reduce((total, point) => total + point.value, 0);
}

/**
 * Keeps the `max` largest slices and merges the rest into a single entry so a
 * donut or legend never grows unbounded. Merging happens only when it would
 * actually remove a slice, and totals are preserved exactly.
 */
export function collapseSeries(
  points: SeriesPoint[],
  max: number,
  otherLabel: string,
): SeriesPoint[] {
  if (points.length <= max) return points;
  const sorted = [...points].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, Math.max(1, max - 1));
  const tail = sorted.slice(Math.max(1, max - 1));
  const rest = tail.reduce((total, point) => total + point.value, 0);
  return [...head, { key: "other", label: otherLabel, value: rest }];
}
