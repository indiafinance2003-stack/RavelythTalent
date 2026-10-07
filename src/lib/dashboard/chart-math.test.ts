import { describe, expect, it } from "vitest";
import {
  arcPath,
  barChartGeometry,
  buildTicks,
  DEFAULT_CHART_PADDING,
  donutGeometry,
  lineChartGeometry,
  niceCeiling,
  type ChartBox,
} from "@/lib/dashboard/chart-math";

const box: ChartBox = {
  width: 300,
  height: 160,
  padding: DEFAULT_CHART_PADDING,
};

describe("niceCeiling", () => {
  it("rounds up to a readable 1/2/5 magnitude", () => {
    expect(niceCeiling(0)).toBe(0);
    expect(niceCeiling(-5)).toBe(0);
    expect(niceCeiling(0.4)).toBe(0.5);
    expect(niceCeiling(7)).toBe(10);
    expect(niceCeiling(15)).toBe(20);
    expect(niceCeiling(123)).toBe(200);
    expect(niceCeiling(1200)).toBe(2000);
  });
});

describe("buildTicks", () => {
  it("returns ascending ticks including zero and the maximum", () => {
    expect(buildTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(buildTicks(100, 2)).toEqual([0, 50, 100]);
    expect(buildTicks(7, 2)).toEqual([0, 4, 7]);
    expect(buildTicks(0)).toEqual([0]);
  });
});

describe("lineChartGeometry", () => {
  it("returns nothing for an empty series", () => {
    const geometry = lineChartGeometry([], box);
    expect(geometry.line).toBe("");
    expect(geometry.area).toBe("");
    expect(geometry.points).toHaveLength(0);
  });

  it("places a single point without producing NaN", () => {
    const geometry = lineChartGeometry([5], box);
    expect(geometry.points).toHaveLength(1);
    expect(geometry.line).not.toContain("NaN");
    expect(geometry.area.endsWith("Z")).toBe(true);
  });

  it("keeps every point inside the chart box", () => {
    const geometry = lineChartGeometry([0, 4, 8, 15], box);
    expect(geometry.max).toBe(20);
    for (const point of geometry.points) {
      expect(point.x).toBeGreaterThanOrEqual(box.padding.left);
      expect(point.x).toBeLessThanOrEqual(box.width - box.padding.right);
      expect(point.y).toBeGreaterThanOrEqual(box.padding.top - 1);
      expect(point.y).toBeLessThanOrEqual(box.height - box.padding.bottom + 1);
    }
    expect(geometry.points[0]!.y).toBeGreaterThan(geometry.points.at(-1)!.y);
  });

  it("flattens a zero series onto the baseline", () => {
    const geometry = lineChartGeometry([0, 0, 0], box);
    for (const point of geometry.points) {
      expect(point.y).toBeCloseTo(box.height - box.padding.bottom, 5);
    }
  });
});

describe("barChartGeometry", () => {
  it("lays out one bar per value", () => {
    const geometry = barChartGeometry([[1, 2, 3]], box);
    expect(geometry.bars).toHaveLength(3);
    expect(geometry.max).toBe(5);
    for (const bar of geometry.bars) {
      expect(bar.x).toBeGreaterThanOrEqual(box.padding.left - 1);
      expect(bar.x + bar.width).toBeLessThanOrEqual(box.width - box.padding.right + 1);
      expect(bar.y).toBeGreaterThanOrEqual(box.padding.top - 1);
      expect(bar.height).toBeGreaterThanOrEqual(0);
    }
  });

  it("lays out two series side by side", () => {
    const geometry = barChartGeometry(
      [
        [10, 20],
        [5, 8],
      ],
      box,
    );
    expect(geometry.bars).toHaveLength(4);
    expect(geometry.bars[0]!.x).toBeLessThan(geometry.bars[1]!.x);
    expect(geometry.bars[1]!.x).toBeLessThan(geometry.bars[2]!.x);
  });

  it("gives zero values no height", () => {
    const geometry = barChartGeometry([[0, 0]], box);
    for (const bar of geometry.bars) expect(bar.height).toBe(0);
  });
});

describe("donutGeometry", () => {
  const slices = [
    { label: "Engineering", value: 50, color: "#1F6FEB" },
    { label: "Sales", value: 30, color: "#3DB8B0" },
    { label: "Design", value: 20, color: "#0B2A6F" },
  ];

  it("splits the ring into percentages that sum to 100", () => {
    const geometry = donutGeometry(slices);
    expect(geometry.total).toBe(100);
    expect(geometry.segments.map((segment) => segment.percent)).toEqual([
      50, 30, 20,
    ]);
    expect(geometry.segments.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
  });

  it("emits arc paths that start with M and contain an arc command", () => {
    const geometry = donutGeometry(slices);
    for (const segment of geometry.segments) {
      expect(segment.path.startsWith("M")).toBe(true);
      expect(segment.path).toContain("A");
      expect(segment.path.endsWith("Z")).toBe(true);
      expect(segment.path).not.toContain("NaN");
    }
  });

  it("skips zero-value slices but keeps them in the legend", () => {
    const geometry = donutGeometry([
      { label: "Engineering", value: 10, color: "#1F6FEB" },
      { label: "Design", value: 0, color: "#0B2A6F" },
    ]);
    expect(geometry.segments).toHaveLength(2);
    expect(geometry.segments[1]!.path).toBe("");
    expect(geometry.segments[1]!.percent).toBe(0);
  });

  it("draws a full ring for a single 100% slice", () => {
    const geometry = donutGeometry([{ label: "All", value: 3, color: "#1F6FEB" }]);
    const path = geometry.segments[0]!.path;
    expect(path.startsWith("M")).toBe(true);
    expect((path.match(/A/g) ?? []).length).toBe(4);
    expect(path).not.toContain("NaN");
  });

  it("returns an empty path set when every value is zero", () => {
    const geometry = donutGeometry([
      { label: "Engineering", value: 0, color: "#1F6FEB" },
      { label: "Sales", value: 0, color: "#3DB8B0" },
    ]);
    expect(geometry.total).toBe(0);
    expect(geometry.segments.every((segment) => segment.path === "")).toBe(true);
    expect(geometry.segments.every((segment) => segment.percent === 0)).toBe(true);
  });
});

describe("arcPath", () => {
  it("builds a partial annulus sector", () => {
    const path = arcPath(90, 90, 80, 24, -90, 0);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect((path.match(/A/g) ?? []).length).toBe(2);
    expect(path).not.toContain("NaN");
  });

  it("flags large arcs", () => {
    const small = arcPath(90, 90, 80, 24, 0, 90);
    const large = arcPath(90, 90, 80, 24, 0, 270);
    expect(small).toContain("A80 80 0 0 1");
    expect(large).toContain("A80 80 0 1 1");
  });
});
