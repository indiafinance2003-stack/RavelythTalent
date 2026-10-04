"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialFormState,
  );

  if (!token) {
    return (
      <div className="surface p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-navy">Invalid reset link</h1>
        <p className="mt-2 text-sm text-slate-600">
          This password reset link is missing its token. Request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-600">
        This link can be used once and expires in 1 hour.
      </p>

      {state.status === "success" && state.message ? (
        <Alert tone="success" className="mt-5">
          {state.message}
        </Alert>
      ) : null}
      {state.status === "error" && state.message ? (
        <Alert tone="error" className="mt-5">
          {state.message}
        </Alert>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <input type="hidden" name="token" value={token} />

        <Field
          label="New password"
          htmlFor="password"
          error={state.fieldErrors?.password}
          hint="At least 8 characters, with a letter and a number."
          required
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            invalid={Boolean(state.fieldErrors?.password)}
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={state.fieldErrors?.confirmPassword}
          required
        >
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            invalid={Boolean(state.fieldErrors?.confirmPassword)}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Updating..." : "Update password"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/login" className="font-semibold text-royal hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}