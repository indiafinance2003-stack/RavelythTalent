'use client';

import type { ReactNode } from 'react';

/**
 * Shared portal UI primitives.
 *
 * Every state the user can actually be in is represented here — loading, error,
 * empty, forbidden, unauthenticated — so no screen has to invent its own and
 * none can quietly render a blank panel that looks like "nothing to do" when in
 * fact a request failed.
 */

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'li';
}): React.ReactElement {
  return (
    <Tag className={`rounded-xl border border-line bg-navy-surface ${className}`}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-soft">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description ? <div className="mt-2 max-w-2xl text-sm text-slate-400">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  title?: string;
}): React.ReactElement {
  const variants: Record<string, string> = {
    primary: 'bg-accent text-white hover:bg-accent-strong disabled:bg-accent/50',
    secondary:
      'border border-line text-slate-300 hover:border-accent hover:text-accent disabled:opacity-50',
    ghost: 'text-slate-400 hover:bg-paper hover:text-accent disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  };
  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

/**
 * Inline status message.
 *
 * `role="status"` for successes and `role="alert"` for problems, so a screen
 * reader announces the outcome of an action rather than only showing it.
 */
export function Alert({
  kind,
  children,
}: {
  kind: 'success' | 'error' | 'info' | 'warning';
  children: ReactNode;
}): React.ReactElement {
  const tones: Record<string, string> = {
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    error: 'border-red-500/40 bg-red-500/10 text-red-200',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  };
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${tones[kind]}`}
    >
      {children}
    </div>
  );
}

/** Loading placeholder. Announced, not just animated. */
export function LoadingState({ label = 'Loading…' }: { label?: string }): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-xl border border-line bg-navy-surface px-5 py-10 text-sm text-slate-400"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
      />
      {label}
    </div>
  );
}

/** Shown when a request FAILED. Never conflated with an empty result. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-8 text-center"
    >
      <p className="text-sm font-medium text-red-200">Something went wrong</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-red-200/80">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Shown when a request succeeded and genuinely returned nothing. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-dashed border-line bg-navy-surface px-5 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <div className="mx-auto mt-1 max-w-md text-sm text-slate-400">{description}</div>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Shown when the caller's role or ownership does not permit the page. */
export function ForbiddenState({ message }: { message: string }): React.ReactElement {
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-10 text-center"
    >
      <p className="text-sm font-medium text-amber-200">Not available for your account</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-amber-200/80">{message}</p>
    </div>
  );
}

/** Labelled pill. Colour is never the only signal: the label always says it. */
export function Badge({
  children,
  tone = 'bg-slate-800 text-slate-300 ring-slate-600',
}: {
  children: ReactNode;
  tone?: string;
}): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {children}
    </span>
  );
}

/** Horizontal meter used for profile completion and credit balances. */
export function Meter({
  value,
  max,
  label,
  tone = 'bg-accent',
}: {
  value: number;
  max: number;
  label: string;
  tone?: string;
}): React.ReactElement {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-paper"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-accent focus:outline-none';

export const labelClass = 'mb-1 block text-sm font-medium text-slate-300';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}): React.ReactElement {
  return (
    <div>
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? (
        <p className="mt-1 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
