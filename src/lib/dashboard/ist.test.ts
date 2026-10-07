import { describe, expect, it } from "vitest";
import {
  addIstDays,
  greetingForHour,
  istDateKey,
  istDaysBetween,
  istParts,
  startOfIstDay,
  startOfIstMonth,
} from "@/lib/dashboard/ist";

describe("ist helpers", () => {
  it("converts an instant to India wall-clock parts", () => {
    // 18:45 UTC is 00:15 IST the next day.
    const parts = istParts(new Date("2026-10-06T18:45:00Z"));
    expect(parts).toEqual({
      year: 2026,
      month: 10,
      day: 7,
      hour: 0,
      minute: 15,
      second: 0,
    });
  });

  it("normalises midnight hours", () => {
    expect(istParts(new Date("2026-10-06T18:30:00Z")).hour).toBe(0);
  });

  it("returns the IST start of day", () => {
    expect(startOfIstDay(new Date("2026-10-06T18:45:00Z")).toISOString()).toBe(
      "2026-10-06T18:30:00.000Z",
    );
  });

  it("returns the IST start of month", () => {
    expect(startOfIstMonth(new Date("2026-10-20T10:00:00Z")).toISOString()).toBe(
      "2026-09-30T18:30:00.000Z",
    );
  });

  it("buckets an instant by its IST date", () => {
    expect(istDateKey(new Date("2026-10-06T18:45:00Z"))).toBe("2026-10-07");
    expect(istDateKey(new Date("2026-10-06T18:29:00Z"))).toBe("2026-10-06");
  });

  it("shifts IST days across a month boundary", () => {
    const firstOfOctober = new Date("2026-09-30T18:30:00Z"); // 01 Oct 00:00 IST
    expect(istDateKey(addIstDays(firstOfOctober, -1))).toBe("2026-09-30");
    expect(istDateKey(addIstDays(firstOfOctober, 1))).toBe("2026-10-02");
  });

  it("counts whole IST days between instants", () => {
    const a = new Date("2026-10-06T18:30:00Z"); // 07 Oct 00:00 IST
    const b = new Date("2026-10-08T18:30:00Z"); // 09 Oct 00:00 IST
    expect(istDaysBetween(a, b)).toBe(2);
    expect(istDaysBetween(b, a)).toBe(-2);
    expect(istDaysBetween(a, a)).toBe(0);
  });

  it("picks a greeting for the IST hour", () => {
    expect(greetingForHour(6)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(16)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good evening");
    expect(greetingForHour(23)).toBe("Good evening");
  });
});
