"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

const ERROR_COPY: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured yet.",
  invalid_state: "That sign-in link expired. Please try again.",
  google_exchange_failed: "Google sign-in failed. Please try again.",
  rate_limited: "Too many attempts. Please wait a few minutes.",
  missing_code: "Google did not return an authorization code.",
};

export function LoginForm({
  next,
  verified,
  googleEnabled,
  error,
}: {
  next?: string;
  verified?: boolean;
  googleEnabled: boolean;
  error?: string;
}) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialFormState,
  );

  return (
    <div className="surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-600">
        Sign in to continue to Ravelyth Talent.
      </p>

      {verified ? (
        <Alert tone="success" className="mt-5">
          Your email is verified. You can sign in now.
        </Alert>
      ) : null}

      {error && ERROR_COPY[error] ? (
        <Alert tone="error" className="mt-5">
          {ERROR_COPY[error]}
        </Alert>
      ) : null}

      {state.status === "error" && state.message ? (
        <Alert tone="error" className="mt-5">
          {state.message}
        </Alert>
      ) : null}

      {googleEnabled ? (
        <>
          <a
            href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-navy transition hover:border-royal hover:text-royal"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.8c1.8 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
              />
            </svg>
            Continue with Google
          </a>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">or</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <Field label="Email address" htmlFor="email" error={state.fieldErrors?.email} required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.values?.email ?? ""}
            placeholder="you@example.com"
            invalid={Boolean(state.fieldErrors?.email)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={state.fieldErrors?.password}
          required
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
            invalid={Boolean(state.fieldErrors?.password)}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-royal hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New to Ravelyth Talent?{" "}
        <Link href="/register" className="font-semibold text-royal hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}