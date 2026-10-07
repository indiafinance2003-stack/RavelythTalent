import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

const BUTTON_VARIANTS = {
  primary:
    "bg-royal text-white shadow-soft hover:bg-royal-600 active:bg-royal-700",
  secondary:
    "border border-slate-300 bg-white text-navy hover:border-royal hover:text-royal",
  ghost: "text-navy hover:bg-sky-tint/50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  subtle: "bg-sky-tint text-navy hover:bg-sky-tint/70",
} as const;

const BUTTON_SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal",
    "focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={buttonClasses(variant, size, className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props} />
  );
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-navy"
      >
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-navy " +
  "placeholder:text-slate-400 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/25 " +
  "disabled:bg-slate-50 disabled:text-slate-500";

export function Input({
  className,
  invalid,
  ...props
}: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL, invalid && "border-red-400 focus:border-red-500", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-28 resize-y", invalid && "border-red-400", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid,
  ...props
}: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      className={cn(CONTROL, "pr-9", invalid && "border-red-400", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Checkbox({
  label,
  id,
  ...props
}: ComponentProps<"input"> & { label: string }) {
  return (
    <span className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-royal focus:ring-royal"
        {...props}
      />
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
      </label>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

const ALERT_TONES = {
  success: "border-teal/40 bg-teal-50 text-navy",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-tint bg-royal-50 text-navy",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        ALERT_TONES[tone],
        className,
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className="leading-relaxed">{children}</div> : null}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("surface p-6 sm:p-7", className)}>{children}</div>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-royal-50 text-royal",
  teal: "bg-teal-50 text-teal-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  navy: "bg-navy-50 text-navy",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-slate-300">{icon}</div> : null}
      <h3 className="text-base font-bold text-navy">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-slate-600">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden="true" />;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-navy sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Soft decorative circle used in hero sections. */
export function DecorCircles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="decor-circle -top-24 -right-16 h-72 w-72 bg-mint-tint" />
      <span className="decor-circle top-1/3 -left-24 h-56 w-56 bg-sky-tint" />
      <span className="decor-circle -bottom-28 right-1/4 h-64 w-64 bg-sky-tint/70" />
    </div>
  );
}