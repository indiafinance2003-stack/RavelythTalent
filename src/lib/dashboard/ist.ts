/**
 * India-time (Asia/Kolkata) helpers shared by the dashboards.
 *
 * India has no daylight saving time, so the offset is a constant +05:30. Every
 * helper converts an instant into IST wall-clock components, does the calendar
 * maths there, then converts back, so "today" and "this month" always follow
 * Indian time rather than the server's timezone.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const IST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export type IstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Wall-clock components of `date` in Asia/Kolkata. */
export function istParts(date: Date): IstParts {
  const bag: Record<string, string> = {};
  for (const part of IST_PARTS.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const num = (key: string) => Number(bag[key] ?? "0");
  // en-CA renders midnight as "24" with hourCycle h24; normalise it to 0.
  const hour = num("hour") % 24;
  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour,
    minute: num("minute"),
    second: num("second"),
  };
}

/** The exact instant at which the IST calendar day containing `date` starts. */
export function startOfIstDay(date: Date): Date {
  const p = istParts(date);
  return fromIstWallClock(p.year, p.month, p.day, 0, 0, 0);
}

/** The exact instant at which the IST calendar month containing `date` starts. */
export function startOfIstMonth(date: Date): Date {
  const p = istParts(date);
  return fromIstWallClock(p.year, p.month, 1, 0, 0, 0);
}

/**
 * The exact instant at which the IST calendar month `monthsBack` months before
 * the month containing `date` starts (0 = current month, 1 = previous, ...).
 */
export function startOfIstMonthBack(date: Date, monthsBack: number): Date {
  const p = istParts(date);
  const zeroBased = p.month - 1 - Math.floor(monthsBack);
  const year = p.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  return fromIstWallClock(year, month + 1, 1, 0, 0, 0);
}

function fromIstWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(utc - IST_OFFSET_MS);
}

/** `YYYY-MM-DD` key for `date` in IST (used for day buckets and chart labels). */
export function istDateKey(date: Date): string {
  const p = istParts(date);
  return `${pad(p.year)}-${pad(p.month)}-${pad(p.day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Shifts an IST calendar day by `days` and returns the new day's 00:00 IST. */
export function addIstDays(date: Date, days: number): Date {
  const p = istParts(date);
  const shifted = fromIstWallClock(p.year, p.month, p.day, 12, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  const next = istParts(shifted);
  return fromIstWallClock(next.year, next.month, next.day, 0, 0, 0);
}

/** Number of IST days between two instants' calendar days (b - a, whole days). */
export function istDaysBetween(a: Date, b: Date): number {
  const ms =
    startOfIstDay(b).getTime() - startOfIstDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Human greeting for an IST hour (0-23). */
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
