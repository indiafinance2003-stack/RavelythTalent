import { describe, expect, it } from "vitest";
import {
  formatCount,
  matchLabelFor,
  percentOf,
  plural,
  trendOf,
} from "@/lib/dashboard/format";

describe("formatCount", () => {
  it("groups digits in the Indian numbering system", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1234567)).toBe("12,34,567");
    expect(formatCount(1234.6)).toBe("1,235");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});

describe("percentOf", () => {
  it("rounds and clamps to 0-100", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(-1, 10)).toBe(0);
    expect(percentOf(20, 10)).toBe(100);
  });
});

describe("trendOf", () => {
  it("reports direction and percentage change", () => {
    expect(trendOf(120, 100)).toEqual({
      delta: 20,
      percent: 20,
      direction: "up",
    });
    expect(trendOf(80, 100)).toEqual({
      delta: -20,
      percent: -20,
      direction: "down",
    });
    expect(trendOf(100, 100)).toEqual({
      delta: 0,
      percent: 0,
      direction: "flat",
    });
  });

  it("omits the percentage when there is no previous value", () => {
    expect(trendOf(5, 0)).toEqual({ delta: 5, percent: null, direction: "up" });
    expect(trendOf(0, 0)).toEqual({ delta: 0, percent: null, direction: "flat" });
  });
});

describe("matchLabelFor", () => {
  it("buckets a deterministic match score", () => {
    expect(matchLabelFor(70)).toBe("Strong match");
    expect(matchLabelFor(69)).toBe("Good match");
    expect(matchLabelFor(50)).toBe("Good match");
    expect(matchLabelFor(49)).toBe("Match");
    expect(matchLabelFor(30)).toBe("Match");
    expect(matchLabelFor(29)).toBeNull();
    expect(matchLabelFor(0)).toBeNull();
  });
});

describe("plural", () => {
  it("appends the right suffix", () => {
    expect(plural(1, "alert")).toBe("1 alert");
    expect(plural(2, "alert")).toBe("2 alerts");
    expect(plural(0, "alert")).toBe("0 alerts");
  });
});
