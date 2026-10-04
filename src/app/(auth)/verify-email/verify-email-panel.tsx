"use client";

import { useActionState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { resendVerificationAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button } from "@/components/ui/primitives";

const ERROR_COPY: Record<string, string> = {
  invalid:
    "That verification link is invalid or has expired. Request a new one below.",
  missing: "That verification link is incomplete. Request a new one below.",
};

export function VerifyEmailPanel({
  ticket,
  error,
}: {
  ticket: string;
  error?: string;
}) {
  const [state, formAction, pending] = useActionState(
    resendVerificationAction,
    initialFormState,
  );

  return (
    <div className="surface p-6 text-center sm:p-8">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal">
        <MailCheck className="h-7 w-7" aria-hidden="true" />
      </span>

      <h1 className="text-2xl font-bold text-navy">Verify your email</h1>
      <p className="mt-2 text-sm text-slate-600">
        We sent a verification link to your inbox. Open it to activate your
        account, then come back here to sign in.
      </p>

      {error && ERROR_COPY[error] ? (
        <Alert tone="error" className="mt-5 text-left">
          {ERROR_COPY[error]}
        </Alert>
      ) : null}
      {state.status === "success" && state.message ? (
        <Alert tone="success" className="mt-5 text-left">
          {state.message}
        </Alert>
      ) : null}
      {state.status === "error" && state.message ? (
        <Alert tone="error" className="mt-5 text-left">
          {state.message}
        </Alert>
      ) : null}

      {ticket ? (
        <form action={formAction} className="mt-6">
          <input type="hidden" name="ticket" value={ticket} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending..." : "Resend verification email"}
          </Button>
        </form>
      ) : null}

      <p className="mt-6 text-sm text-slate-600">
        Already verified?{" "}
        <Link href="/login" className="font-semibold text-royal hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Need help?{" "}
        <Link href="/contact" className="font-medium text-royal hover:underline">
          Contact support
        </Link>
      </p>
    </div>
  );
}