import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  barChartGeometry,
  DEFAULT_CHART_PADDING,
  donutGeometry,
  lineChartGeometry,
  type ChartBox,
} from "@/lib/dashboard/chart-math";
import { SectionCard } from "@/components/dashboard/kit";

/** Ordered brand palette used when a chart does not bring its own colours. */
export const CHART_COLORS = [
  "#1F6FEB",
  "#3DB8B0",
  "#0B2A6F",
  "#F59E0B",
  "#8B5CF6",
  "#EF4444",
] as const;

export type ChartPoint = { label: string; value: number };

function boxFor(width: number, height: number): ChartBox {
  return { width, height, padding: DEFAULT_CHART_PADDING };
}

/** Evenly samples labels so the axis stays readable on narrow charts. */
function sampledLabels(labels: string[], max = 6): Array<string | null> {
  if (labels.length <= max) return labels;
  const step = Math.ceil(labels.length / max);
  return labels.map((label, index) => (index % step === 0 ? label : null));
}

function formatDefault(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact" }).format(value);
}

function AxisText({
  x,
  y,
  children,
  anchor = "middle",
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={10}
      fill="#64748b"
      fontWeight={600}
    >
      {children}
    </text>
  );
}

/* -------------------------------------------------------------------------- */
/* Chart card                                                                 */
/* -------------------------------------------------------------------------- */

export function ChartCard({
  title,
  description,
  legend,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  legend?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SectionCard
      action={action}
      bodyClassName="space-y-3"
      className={className}
      description={description}
      title={title}
    >
      {children}
      {legend}
    </SectionCard>
  );
}

/** Coloured legend items for the charts. */
export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string; value?: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
      {items.map((item) => (
        <li className="inline-flex items-center gap-1.5" key={item.label}>
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
          {item.value ? <span className="text-navy">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Line chart                                                                 */
/* -------------------------------------------------------------------------- */

export function LineChart({
  points,
  formatValue = formatDefault,
  ariaLabel,
  height = 180,
  showArea = true,
  className,
}: {
  points: ChartPoint[];
  formatValue?: (value: number) => string;
  ariaLabel: string;
  height?: number;
  showArea?: boolean;
  className?: string;
}) {
  const width = 560;
  const geometry = lineChartGeometry(
    points.map((point) => point.value),
    boxFor(width, height),
  );
  const labels = sampledLabels(points.map((point) => point.label));

  if (points.length === 0) {
    return (
      <p className="text-sm text-slate-500">No data for this period yet.</p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {geometry.ticks.map((tick) => {
          const denominator = geometry.max === 0 ? 1 : geometry.max;
          const y =
            height -
            DEFAULT_CHART_PADDING.bottom -
            (tick / denominator) *
              (height -
                DEFAULT_CHART_PADDING.top -
                DEFAULT_CHART_PADDING.bottom);
          return (
            <g key={tick}>
              <line
                x1={DEFAULT_CHART_PADDING.left}
                x2={width - DEFAULT_CHART_PADDING.right}
                y1={y}
                y2={y}
                stroke="#e8ecf3"
                strokeDasharray="3 4"
              />
              <AxisText anchor="end" x={DEFAULT_CHART_PADDING.left - 6} y={y + 3}>
                {formatValue(tick)}
              </AxisText>
            </g>
          );
        })}
        {showArea && geometry.area ? (
          <path d={geometry.area} fill="#1F6FEB" opacity={0.1} />
        ) : null}
        <path
          d={geometry.line}
          fill="none"
          stroke="#1F6FEB"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {geometry.points.map((point, index) => (
          <circle
            key={`${point.x}-${index}`}
            cx={point.x}
            cy={point.y}
            r={3}
            fill="#ffffff"
            stroke="#1F6FEB"
            strokeWidth={2}
          />
        ))}
        {labels.map((label, index) =>
          label ? (
            <AxisText
              key={`${label}-${index}`}
              x={geometry.points[index]?.x ?? DEFAULT_CHART_PADDING.left}
              y={height - 6}
            >
              {label}
            </AxisText>
          ) : null,
        )}
      </svg>
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.label}>
            {point.label}: {formatValue(point.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bar chart (one or two series)                                              */
/* -------------------------------------------------------------------------- */

export function BarsChart({
  points,
  series,
  formatValue = formatDefault,
  ariaLabel,
  height = 180,
  className,
}: {
  points: Array<{ label: string; values: number[] }>;
  /** Legend colours; defaults to a single brand-blue series. */
  series?: Array<{ label: string; color: string }>;
  formatValue?: (value: number) => string;
  ariaLabel: string;
  height?: number;
  className?: string;
}) {
  const width = 560;
  const box = boxFor(width, height);
  const seriesColours =
    series && series.length > 0
      ? series
      : [{ label: "Value", color: CHART_COLORS[0] }];
  const geometry = barChartGeometry(
    points.map((point) => point.values),
    box,
  );
  const labels = sampledLabels(points.map((point) => point.label), 8);

  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No data for this period yet.</p>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {geometry.ticks.map((tick) => {
          const denominator = geometry.max === 0 ? 1 : geometry.max;
          const y =
            height -
            DEFAULT_CHART_PADDING.bottom -
            (tick / denominator) *
              (height -
                DEFAULT_CHART_PADDING.top -
                DEFAULT_CHART_PADDING.bottom);
          return (
            <g key={tick}>
              <line
                x1={DEFAULT_CHART_PADDING.left}
                x2={width - DEFAULT_CHART_PADDING.right}
                y1={y}
                y2={y}
                stroke="#e8ecf3"
                strokeDasharray="3 4"
              />
              <AxisText anchor="end" x={DEFAULT_CHART_PADDING.left - 6} y={y + 3}>
                {formatValue(tick)}
              </AxisText>
            </g>
          );
        })}
        <line
          x1={DEFAULT_CHART_PADDING.left}
          x2={width - DEFAULT_CHART_PADDING.right}
          y1={geometry.baseline}
          y2={geometry.baseline}
          stroke="#cbd5e1"
        />
        {geometry.bars.map((bar, index) => (
          <rect
            key={`${bar.index}-${index}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={Math.min(4, bar.width / 2)}
            fill={seriesColours[index % seriesColours.length]?.color ?? CHART_COLORS[0]}
          />
        ))}
        {labels.map((label, index) =>
          label ? (
            <AxisText
              key={`${label}-${index}`}
              x={box.padding.left + (index + 0.5) * geometry.groupWidth}
              y={height - 6}
            >
              {label}
            </AxisText>
          ) : null,
        )}
      </svg>
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.label}>
            {point.label}: {point.values.map(formatValue).join(", ")}
          </li>
        ))}
      </ul>
      {seriesColours.length > 1 ? (
        <ChartLegend items={seriesColours.map((entry) => ({ ...entry }))} />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Donut chart                                                                */
/* -------------------------------------------------------------------------- */

export function DonutChart({
  slices,
  size = 170,
  centerLabel,
  centerValue,
  className,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}) {
  const geometry = donutGeometry(slices, { size, thickness: 24 });
  const visible = geometry.segments.filter((segment) => segment.value > 0);

  if (geometry.total === 0) {
    return <p className="text-sm text-slate-500">No data for this period yet.</p>;
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Distribution: ${visible
            .map((segment) => `${segment.label} ${segment.percent}%`)
            .join(", ")}`}
          className="h-full w-full"
        >
          {geometry.segments.map((segment) =>
            segment.path ? (
              <path
                key={segment.label}
                d={segment.path}
                fill={segment.color}
                stroke="#ffffff"
                strokeWidth={2}
              />
            ) : null,
          )}
        </svg>
        {centerValue || centerLabel ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue ? (
              <span className="text-xl font-extrabold text-navy">{centerValue}</span>
            ) : null}
            {centerLabel ? (
              <span className="max-w-[70%] text-[11px] font-semibold text-slate-500">
                {centerLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="w-full space-y-2 text-sm">
        {visible.map((segment) => (
          <li
            className="flex items-center justify-between gap-3"
            key={segment.label}
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-slate-600">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="truncate">{segment.label}</span>
            </span>
            <span className="shrink-0 font-bold text-navy">
              {segment.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
