"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialFormState,
  );

  return (
    <div className="surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-600">
        Enter the email address on your account and we will send a reset link.
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
        <Field
          label="Email address"
          htmlFor="email"
          error={state.fieldErrors?.email}
          required
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            invalid={Boolean(state.fieldErrors?.email)}
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Sending link..." : "Send reset link"}
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