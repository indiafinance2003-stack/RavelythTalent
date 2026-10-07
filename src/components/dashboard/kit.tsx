import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import type { StatTrend as StatTrendData } from "@/lib/dashboard/format";

/* -------------------------------------------------------------------------- */
/* Section card                                                               */
/* -------------------------------------------------------------------------- */

/** White rounded-2xl card with an optional title row and action slot. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={title && id ? `${id}-title` : undefined}
      className={cn("surface p-5 sm:p-6", className)}
    >
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2
                className="text-base font-bold text-navy"
                id={title && id ? `${id}-title` : undefined}
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI card + trend                                                           */
/* -------------------------------------------------------------------------- */

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  trend,
  trendDirection = "up",
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  trend?: StatTrendData;
  /** Which movement counts as a good thing for this metric. */
  trendDirection?: "up" | "down";
  tone?: "brand" | "teal" | "navy" | "warning";
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "rounded-xl p-2",
              tone === "brand" && "bg-royal-50 text-royal",
              tone === "teal" && "bg-teal-50 text-teal-700",
              tone === "navy" && "bg-navy-50 text-navy",
              tone === "warning" && "bg-amber-50 text-amber-700",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-navy">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {trend ? <StatTrend trend={trend} direction={trendDirection} /> : null}
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="surface block p-5 transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
      >
        {body}
      </Link>
    );
  }
  return <div className="surface p-5">{body}</div>;
}

/** Small up/down indicator with a percentage, colour-coded by desirability. */
export function StatTrend({
  trend,
  direction = "up",
  className,
}: {
  trend: StatTrendData;
  direction?: "up" | "down";
  className?: string;
}) {
  const good =
    trend.direction === "flat"
      ? "neutral"
      : trend.direction === direction
        ? "good"
        : "bad";

  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
        good === "good" && "bg-teal-50 text-teal-700",
        good === "bad" && "bg-red-50 text-red-700",
        good === "neutral" && "bg-slate-100 text-slate-600",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {trend.percent !== null ? `${Math.abs(trend.percent)}%` : "New"}
      <span className="sr-only">
        {trend.direction === "up"
          ? "increase"
          : trend.direction === "down"
            ? "decrease"
            : "no change"}{" "}
        versus the previous period
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/** Horizontal progress bar (0-100). */
export function ProgressBar({
  percent,
  tone = "brand",
  label,
}: {
  percent: number;
  tone?: "brand" | "teal" | "warning" | "danger";
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      {label ? (
        <p className="mb-1.5 text-xs font-semibold text-slate-600">{label}</p>
      ) : null}
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "brand" && "bg-royal",
            tone === "teal" && "bg-teal",
            tone === "warning" && "bg-amber-500",
            tone === "danger" && "bg-red-500",
          )}
          style={{ width: `${Math.max(2, clamped)}%` }}
        />
      </div>
    </div>
  );
}

/** Circular progress ring, used for profile completeness. */
export function RingProgress({
  percent,
  size = 132,
  label,
  sublabel,
  tone = "brand",
}: {
  percent: number;
  size?: number;
  label?: string;
  sublabel?: string;
  tone?: "brand" | "teal" | "warning";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`${label ?? "Completeness"}: ${clamped}%`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className={cn(
            tone === "brand" && "stroke-royal",
            tone === "teal" && "stroke-teal",
            tone === "warning" && "stroke-amber-500",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-navy">{clamped}%</span>
        {sublabel ? (
          <span className="max-w-[70%] text-center text-[11px] font-semibold text-slate-500">
            {sublabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status chip                                                                */
/* -------------------------------------------------------------------------- */

export type { BadgeTone };

/** Compact status pill reusing the shared Badge tones. */
export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge className={cn("whitespace-nowrap", className)} tone={tone}>
      {children}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Data table                                                                 */
/* -------------------------------------------------------------------------- */

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Defaults to the raw row value for this key. */
  cell?: (row: T) => ReactNode;
};

/** Simple responsive table: stacked cards below `sm`, columns above. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500",
                  column.align === "right" && "text-right",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-slate-100 last:border-0" key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-3 align-middle text-slate-700",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.cell ? column.cell(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Small uppercase group heading used by the sidebars and cards. */
export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-bold uppercase tracking-wider", className)}>
      {children}
    </p>
  );
}

/** Inline metric used inside cards (label left, value right). */
export function MetricRow({
  label,
  value,
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 truncate text-slate-600">{label}</span>
      {href ? (
        <Link
          href={href}
          className="shrink-0 font-semibold text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
        >
          {value}
        </Link>
      ) : (
        <span className="shrink-0 font-bold text-navy">{value}</span>
      )}
    </div>
  );
}
