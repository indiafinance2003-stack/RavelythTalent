import { describe, expect, it } from "vitest";
import {
  collapseSeries,
  fillDailySeries,
  fillMonthlySeries,
  sumSeries,
} from "@/lib/dashboard/series";

describe("fillDailySeries", () => {
  it("returns one point per IST day, ending today IST, with zero-filled gaps", () => {
    const now = new Date("2026-10-06T18:30:00Z"); // 07 Oct 00:00 IST
    const points = fillDailySeries(3, now, {
      "2026-10-05": 4,
      "2026-10-07": 9,
    });
    expect(points.map((point) => point.key)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(points.map((point) => point.value)).toEqual([4, 0, 9]);
    expect(points.map((point) => point.label)).toEqual([
      "5 Oct",
      "6 Oct",
      "7 Oct",
    ]);
    expect(sumSeries(points)).toBe(13);
  });

  it("crosses a month boundary using Indian dates", () => {
    const now = new Date("2026-09-30T18:30:00Z"); // 01 Oct 00:00 IST
    const points = fillDailySeries(2, now, {});
    expect(points.map((point) => point.key)).toEqual([
      "2026-09-30",
      "2026-10-01",
    ]);
  });

  it("always returns at least one point", () => {
    const points = fillDailySeries(0, new Date("2026-10-06T12:00:00Z"), {});
    expect(points).toHaveLength(1);
  });
});

describe("fillMonthlySeries", () => {
  it("returns one point per month with zero-filled gaps", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    const points = fillMonthlySeries(3, now, { "2026-08": 10, "2026-10": 5 });
    expect(points.map((point) => point.key)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(points.map((point) => point.value)).toEqual([10, 0, 5]);
    expect(points.map((point) => point.label)).toEqual(["Aug", "Sept", "Oct"]);
  });

  it("rolls across a year boundary and disambiguates the year", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const points = fillMonthlySeries(3, now, {});
    expect(points.map((point) => point.key)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    expect(points.map((point) => point.label)).toEqual([
      "Nov '25",
      "Dec '25",
      "Jan",
    ]);
  });
});

describe("collapseSeries", () => {
  it("keeps the series untouched when it already fits", () => {
    const points = fillMonthlySeries(3, new Date("2026-10-06T12:00:00Z"), {
      "2026-08": 10,
      "2026-09": 2,
      "2026-10": 5,
    });
    expect(collapseSeries(points, 5, "Other")).toEqual(points);
  });

  it("merges the smallest slices into one bucket and preserves the total", () => {
    const points = [
      { key: "a", label: "A", value: 10 },
      { key: "b", label: "B", value: 7 },
      { key: "c", label: "C", value: 4 },
      { key: "d", label: "D", value: 2 },
      { key: "e", label: "E", value: 1 },
    ];
    const collapsed = collapseSeries(points, 3, "Other");
    expect(collapsed.map((point) => point.label)).toEqual(["A", "B", "Other"]);
    expect(collapsed.map((point) => point.value)).toEqual([10, 7, 7]);
    expect(sumSeries(collapsed)).toBe(sumSeries(points));
  });
});
