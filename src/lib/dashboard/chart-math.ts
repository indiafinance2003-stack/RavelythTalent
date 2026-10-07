/**
 * Pure geometry for the dashboard SVG charts.
 *
 * Everything here is deterministic and framework-free so the chart components
 * stay thin renderers and the maths can be unit tested without a DOM.
 */

export type ChartBox = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
};

export const DEFAULT_CHART_PADDING = { top: 12, right: 12, bottom: 24, left: 40 };

/** Rounds a maximum value up to a readable 1/2/5 x 10^n ceiling. */
export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Ascending axis ticks from 0 to `max` (inclusive), `count + 1` entries. */
export function buildTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const safeCount = Math.max(1, Math.floor(count));
  return Array.from({ length: safeCount + 1 }, (_, index) =>
    Math.round((max / safeCount) * index),
  );
}

export type LineGeometry = {
  /** Polyline path (`M`/`L` only). Empty string for no points. */
  line: string;
  /** Closed path under the line, for the soft fill. */
  area: string;
  points: Array<{ x: number; y: number; value: number }>;
  max: number;
  ticks: number[];
};

/** Maps values onto a line chart inside `box`. */
export function lineChartGeometry(
  values: number[],
  box: ChartBox,
): LineGeometry {
  const max = niceCeiling(Math.max(0, ...values));
  const ticks = buildTicks(max);
  const innerWidth = Math.max(1, box.width - box.padding.left - box.padding.right);
  const innerHeight = Math.max(1, box.height - box.padding.top - box.padding.bottom);
  const baseline = box.height - box.padding.bottom;
  const denominator = max === 0 ? 1 : max;

  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? box.padding.left + innerWidth / 2
        : box.padding.left + (index / (values.length - 1)) * innerWidth;
    const ratio = Math.max(0, Math.min(1, value / denominator));
    const y = box.padding.top + innerHeight - ratio * innerHeight;
    return { x, y, value };
  });

  if (points.length === 0) return { line: "", area: "", points, max, ticks };

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`)
    .join(" ");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const area = `${line} L${round(last.x)} ${round(baseline)} L${round(first.x)} ${round(baseline)} Z`;

  return { line, area, points, max, ticks };
}

export type BarGeometry = {
  bars: Array<{ x: number; y: number; width: number; height: number; value: number; index: number }>;
  groupWidth: number;
  max: number;
  ticks: number[];
  baseline: number;
};

/** Maps one or more evenly spaced bar series onto the chart box. */
export function barChartGeometry(
  series: number[][],
  box: ChartBox,
): BarGeometry {
  const flat = series.flat();
  const max = niceCeiling(Math.max(0, ...flat));
  const ticks = buildTicks(max);
  const innerWidth = Math.max(1, box.width - box.padding.left - box.padding.right);
  const innerHeight = Math.max(1, box.height - box.padding.top - box.padding.bottom);
  const baseline = box.height - box.padding.bottom;
  const groupCount = Math.max(1, series[0]?.length ?? 1);
  const groupWidth = innerWidth / groupCount;
  const seriesCount = Math.max(1, series.length);
  const barWidth = Math.max(2, (groupWidth * 0.72) / seriesCount);
  const denominator = max === 0 ? 1 : max;

  const bars: BarGeometry["bars"] = [];
  // Group-major order: every series of group 0, then group 1, ... so the bars
  // read left to right for screen readers and legends.
  for (let index = 0; index < groupCount; index += 1) {
    for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1) {
      const value = series[seriesIndex]?.[index] ?? 0;
      const ratio = Math.max(0, Math.min(1, value / denominator));
      const height = ratio * innerHeight;
      const groupStart = box.padding.left + index * groupWidth;
      const x =
        groupStart + groupWidth / 2 - (barWidth * seriesCount) / 2 + seriesIndex * barWidth;
      bars.push({ x, y: baseline - height, width: barWidth, height, value, index });
    }
  }

  return { bars, groupWidth, max, ticks, baseline };
}

export type DonutSliceInput = { label: string; value: number; color: string };

export type DonutSegment = DonutSliceInput & {
  percent: number;
  /** SVG path for the annulus sector (empty when the value is 0). */
  path: string;
  startAngle: number;
  endAngle: number;
};

export type DonutGeometry = {
  segments: DonutSegment[];
  total: number;
  cx: number;
  cy: number;
  radius: number;
  thickness: number;
};

/**
 * Builds annulus sectors for a donut chart starting at 12 o'clock, clockwise.
 * Zero-value slices are kept in the list with an empty path so legends stay
 * stable, but they never receive arc geometry.
 */
export function donutGeometry(
  slices: DonutSliceInput[],
  options: { size?: number; thickness?: number } = {},
): DonutGeometry {
  const size = options.size ?? 180;
  const thickness = options.thickness ?? 26;
  const radius = size / 2;
  const cx = radius;
  const cy = radius;
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);

  let angle = -90;
  const segments = slices.map((slice) => {
    const value = Math.max(0, slice.value);
    const sweep = total > 0 ? (value / total) * 360 : 0;
    const startAngle = angle;
    const endAngle = angle + sweep;
    angle = endAngle;
    const path =
      value > 0 && total > 0 ? arcPath(cx, cy, radius, thickness, startAngle, endAngle) : "";
    return {
      ...slice,
      value,
      percent: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
      path,
      startAngle,
      endAngle,
    };
  });

  return { segments, total, cx, cy, radius, thickness };
}

/** Annulus sector path between two degrees (0deg = 12 o'clock, clockwise). */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  startAngle: number,
  endAngle: number,
): string {
  const outer = radius;
  const inner = Math.max(1, radius - thickness);
  const sweep = Math.max(0, endAngle - startAngle);

  if (sweep >= 359.999) {
    // A full ring cannot be drawn with a single arc; split it in two halves.
    const half = 180;
    return [
      `M${polar(cx, cy, outer, startAngle)}`,
      `A${outer} ${outer} 0 0 1 ${polar(cx, cy, outer, startAngle + half)}`,
      `A${outer} ${outer} 0 0 1 ${polar(cx, cy, outer, startAngle + 2 * half)}`,
      `L${polar(cx, cy, inner, startAngle)}`,
      `A${inner} ${inner} 0 0 0 ${polar(cx, cy, inner, startAngle - half)}`,
      `A${inner} ${inner} 0 0 0 ${polar(cx, cy, inner, startAngle - 2 * half)}`,
      "Z",
    ].join(" ");
  }

  const largeArc = sweep > 180 ? 1 : 0;
  return [
    `M${polar(cx, cy, outer, startAngle)}`,
    `A${outer} ${outer} 0 ${largeArc} 1 ${polar(cx, cy, outer, endAngle)}`,
    `L${polar(cx, cy, inner, endAngle)}`,
    `A${inner} ${inner} 0 ${largeArc} 0 ${polar(cx, cy, inner, startAngle)}`,
    "Z",
  ].join(" ");
}

function polar(cx: number, cy: number, radius: number, angleDeg: number): string {
  const rad = (angleDeg * Math.PI) / 180;
  return `${round(cx + radius * Math.cos(rad))} ${round(cy + radius * Math.sin(rad))}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
