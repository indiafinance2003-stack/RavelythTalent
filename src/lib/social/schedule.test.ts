import { describe, expect, it } from "vitest";
import {
  canPublishSocialPost,
  istDayKey,
  isWithinPostingWindow,
  istMinutesOfDay,
  retryDelayMs,
  startOfIstDay,
  MAX_POST_ATTEMPTS,
} from "./schedule";

describe("IST posting window", () => {
  // 2026-10-07T10:00:00Z = 15:30 IST
  const middayUtc = new Date("2026-10-07T10:00:00.000Z");
  // 2026-10-07T04:00:00Z = 09:30 IST
  const earlyUtc = new Date("2026-10-07T04:00:00.000Z");
  // 2026-10-07T16:00:00Z = 21:30 IST
  const lateUtc = new Date("2026-10-07T16:00:00.000Z");

  it("converts instants to Asia/Kolkata day keys and minutes", () => {
    expect(istDayKey(middayUtc)).toBe("2026-10-07");
    expect(istMinutesOfDay(middayUtc)).toBe(15 * 60 + 30);
    expect(startOfIstDay(middayUtc).toISOString()).toBe("2026-10-06T18:30:00.000Z");
  });

  it("accepts times inside the default 09:00-21:00 window and rejects outside", () => {
    expect(isWithinPostingWindow(middayUtc, "09:00", "21:00")).toBe(true);
    expect(isWithinPostingWindow(earlyUtc, "09:00", "21:00")).toBe(true);
    expect(isWithinPostingWindow(lateUtc, "09:00", "21:00")).toBe(false);
    // 04:00 UTC is 09:30 IST - one minute before opening must fail.
    const justBefore = new Date("2026-10-07T03:29:00.000Z");
    expect(isWithinPostingWindow(justBefore, "09:00", "21:00")).toBe(false);
  });

  it("rejects malformed windows instead of posting at any time", () => {
    expect(isWithinPostingWindow(middayUtc, "9am", "21:00")).toBe(false);
    expect(isWithinPostingWindow(middayUtc, "09:00", "25:99")).toBe(false);
  });
});

describe("daily cap and spacing", () => {
  const now = new Date("2026-10-07T10:00:00.000Z");

  it("blocks when the daily cap is reached", () => {
    const gate = canPublishSocialPost({
      now,
      windowStart: "00:00",
      windowEnd: "23:59",
      publishedToday: 10,
      maxPostsPerDay: 10,
      lastPublishedAt: new Date(now.getTime() - 60 * 60_000),
      minMinutesBetweenPosts: 20,
    });
    expect(gate).toEqual({ allowed: false, reason: "daily cap reached" });
  });

  it("blocks when the minimum spacing has not elapsed", () => {
    const gate = canPublishSocialPost({
      now,
      windowStart: "00:00",
      windowEnd: "23:59",
      publishedToday: 2,
      maxPostsPerDay: 10,
      lastPublishedAt: new Date(now.getTime() - 5 * 60_000),
      minMinutesBetweenPosts: 20,
    });
    expect(gate).toEqual({ allowed: false, reason: "minimum spacing not reached" });
  });

  it("blocks outside the posting window", () => {
    const gate = canPublishSocialPost({
      now,
      windowStart: "09:00",
      windowEnd: "21:00",
      publishedToday: 0,
      maxPostsPerDay: 10,
      lastPublishedAt: null,
      minMinutesBetweenPosts: 20,
    });
    expect(gate.allowed).toBe(true);
    const late = canPublishSocialPost({
      now: new Date("2026-10-07T17:00:00.000Z"),
      windowStart: "09:00",
      windowEnd: "21:00",
      publishedToday: 0,
      maxPostsPerDay: 10,
      lastPublishedAt: null,
      minMinutesBetweenPosts: 20,
    });
    expect(late).toEqual({ allowed: false, reason: "outside the posting window" });
  });

  it("allows publishing when all gates pass", () => {
    const gate = canPublishSocialPost({
      now,
      windowStart: "09:00",
      windowEnd: "21:00",
      publishedToday: 3,
      maxPostsPerDay: 10,
      lastPublishedAt: new Date(now.getTime() - 30 * 60_000),
      minMinutesBetweenPosts: 20,
    });
    expect(gate).toEqual({ allowed: true });
  });
});

describe("retry backoff", () => {
  it("grows exponentially and stops after the attempt budget", () => {
    expect(retryDelayMs(1)).toBe(10 * 60_000);
    expect(retryDelayMs(2)).toBe(20 * 60_000);
    expect(retryDelayMs(3)).toBe(40 * 60_000);
    expect(MAX_POST_ATTEMPTS).toBe(4);
    expect(retryDelayMs(MAX_POST_ATTEMPTS)).toBeNull();
    expect(retryDelayMs(MAX_POST_ATTEMPTS + 1)).toBeNull();
    expect(retryDelayMs(0)).toBeNull();
  });
});
