import { describe, expect, it } from "vitest";
import {
  buildDigestEmail,
  digestDecision,
  digestHasContent,
  digestItems,
  EMPTY_DIGEST_COUNTS,
  isSameIstDay,
  istDayStart,
  type DigestCounts,
} from "./digest-logic";

function counts(overrides: Partial<DigestCounts>): DigestCounts {
  return { ...EMPTY_DIGEST_COUNTS, ...overrides };
}

describe("istDayStart", () => {
  it("returns the IST midnight for a mid-evening UTC instant", () => {
    // 2026-10-08T18:00:00Z == 2026-10-08T23:30:00+05:30 (an IST weekday)
    const start = istDayStart(new Date("2026-10-08T18:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-07T18:30:00.000Z");
  });

  it("returns the following IST midnight for a late-evening UTC instant", () => {
    // 2026-10-08T19:00:00Z == 2026-10-09T00:30:00+05:30
    const start = istDayStart(new Date("2026-10-08T19:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-08T18:30:00.000Z");
  });
});

describe("isSameIstDay", () => {
  it("treats instants on opposite sides of IST midnight as different days", () => {
    expect(isSameIstDay(
      new Date("2026-10-08T18:29:59Z"),
      new Date("2026-10-08T18:30:01Z"),
    )).toBe(false);
  });

  it("treats instants within the same IST day as equal", () => {
    expect(isSameIstDay(
      new Date("2026-10-08T18:30:00Z"),
      new Date("2026-10-09T08:00:00Z"),
    )).toBe(true);
  });
});

describe("digestDecision", () => {
  const now = new Date("2026-10-08T18:31:00Z");

  it("sends when there is content and no digest was queued today", () => {
    expect(digestDecision(counts({ approvalsWaiting: 3 }), null, now)).toBe("send");
  });

  it("skips when the last digest was queued on the same day", () => {
    const earlier = new Date("2026-10-08T18:30:05Z");
    expect(digestDecision(counts({ approvalsWaiting: 3 }), earlier, now)).toBe("skip_already_sent");
  });

  it("sends again the next day even with identical content", () => {
    const yesterday = new Date("2026-10-07T18:31:00Z");
    expect(digestDecision(counts({ approvalsWaiting: 3 }), yesterday, now)).toBe("send");
  });

  it("skips when every count is zero", () => {
    expect(digestDecision(EMPTY_DIGEST_COUNTS, null, now)).toBe("skip_empty");
  });
});

describe("digestHasContent", () => {
  it("is false only when all counts are zero", () => {
    expect(digestHasContent(EMPTY_DIGEST_COUNTS)).toBe(false);
    expect(digestHasContent(counts({ bouncesYesterday: 1 }))).toBe(true);
    expect(digestHasContent(counts({ sendsYesterday: 5 }))).toBe(true);
  });
});

describe("digestItems", () => {
  it("lists only non-zero counts with working admin links", () => {
    const items = digestItems(counts({
      approvalsWaiting: 1,
      threadsNeedingAttention: 2,
      newReplies24h: 3,
      targetsToReview: 4,
    }));
    expect(items).toHaveLength(4);
    expect(items[0]?.label).toBe("1 campaign message awaiting your approval.");
    expect(items[1]?.label).toBe("2 inbox threads need attention.");
    expect(items[0]?.href).toMatch(/^http:\/\/localhost:3000\/admin\/assistant\/campaigns$/);
  });

  it("returns an empty list for zero counts", () => {
    expect(digestItems(EMPTY_DIGEST_COUNTS)).toHaveLength(0);
  });
});

describe("buildDigestEmail", () => {
  it("produces subject, html and plain-text with content", () => {
    const email = buildDigestEmail(counts({ approvalsWaiting: 2, bouncesYesterday: 1 }), new Date("2026-10-08T18:31:00Z"));
    expect(email.subject).toContain("daily assistant digest");
    expect(email.html).toContain("Open assistant inbox");
    expect(email.text).toContain("2 campaign messages awaiting your approval");
    expect(email.text).toContain("1 bounce yesterday");
  });

  it("produces a quiet email without a call to action when empty", () => {
    const email = buildDigestEmail(EMPTY_DIGEST_COUNTS, new Date("2026-10-08T18:31:00Z"));
    expect(email.text).toContain("Nothing needs your attention today");
    expect(email.html).not.toContain("Open assistant inbox");
  });
});