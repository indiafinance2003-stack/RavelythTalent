/**
 * Pure IST-based scheduling rules for social auto-posting (Task 9).
 * Nothing here touches the network or the database.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" for the given instant in Asia/Kolkata. */
export function istDayKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of the Asia/Kolkata calendar day containing `now`. */
export function startOfIstDay(now: Date): Date {
  return new Date(Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** Minutes elapsed in the Asia/Kolkata day containing `now` (0-1439). */
export function istMinutesOfDay(now: Date): number {
  return Math.floor((((now.getTime() + IST_OFFSET_MS) % DAY_MS) + DAY_MS) / 60_000) % 1440;
}

/** Parse "HH:MM" (24h) to minutes past midnight, or null when malformed. */
export function parseHhmm(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** True when `now` falls inside the IST window [start, end). Supports overnight windows. */
export function isWithinPostingWindow(now: Date, start: string, end: string): boolean {
  const startMin = parseHhmm(start);
  const endMin = parseHhmm(end);
  if (startMin === null || endMin === null) return false;
  const minutes = istMinutesOfDay(now);
  return startMin <= endMin
    ? minutes >= startMin && minutes < endMin
    : minutes >= startMin || minutes < endMin;
}

export const MAX_POST_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 10 * 60_000;

/**
 * Exponential backoff for failed posts: 10 min, 20 min, 40 min.
 * Returns null when the attempt budget is exhausted (>= MAX_POST_ATTEMPTS).
 */
export function retryDelayMs(attempts: number): number | null {
  if (attempts < 1 || attempts >= MAX_POST_ATTEMPTS) return null;
  return BASE_RETRY_DELAY_MS * 2 ** (attempts - 1);
}

export type PublishGate =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Daily cap, minimum spacing and posting-window checks for one platform. */
export function canPublishSocialPost(input: {
  now: Date;
  windowStart: string;
  windowEnd: string;
  publishedToday: number;
  maxPostsPerDay: number;
  lastPublishedAt: Date | null;
  minMinutesBetweenPosts: number;
}): PublishGate {
  if (!isWithinPostingWindow(input.now, input.windowStart, input.windowEnd)) {
    return { allowed: false, reason: "outside the posting window" };
  }
  if (input.publishedToday >= input.maxPostsPerDay) {
    return { allowed: false, reason: "daily cap reached" };
  }
  if (input.lastPublishedAt) {
    const elapsedMs = input.now.getTime() - input.lastPublishedAt.getTime();
    if (elapsedMs < input.minMinutesBetweenPosts * 60_000) {
      return { allowed: false, reason: "minimum spacing not reached" };
    }
  }
  return { allowed: true };
}
