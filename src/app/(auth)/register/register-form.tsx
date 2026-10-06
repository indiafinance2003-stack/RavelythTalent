"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { Briefcase, UserRound } from "lucide-react";
import { registerAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialFormState,
  );
  const [role, setRole] = useState<"job_seeker" | "recruiter">("job_seeker");

  return (
    <div className="surface p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-navy">Create your account</h1>
      <p className="mt-1 text-sm text-slate-600">
        Applying is free for candidates. Every approved company gets one free
        job post to start hiring.
      </p>

      {state.status === "error" && state.message ? (
        <Alert tone="error" className="mt-5">
          {state.message}
        </Alert>
      ) : null}

      <fieldset className="mt-6">
        <legend className="sr-only">I am joining as</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <RoleOption
            id="role-seeker"
            active={role === "job_seeker"}
            icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
            title="Job seeker"
            description="Find and apply for jobs"
            onSelect={() => setRole("job_seeker")}
          />
          <RoleOption
            id="role-recruiter"
            active={role === "recruiter"}
            icon={<Briefcase className="h-5 w-5" aria-hidden="true" />}
            title="Employer"
            description="Post jobs and hire talent"
            onSelect={() => setRole("recruiter")}
          />
        </div>
      </fieldset>

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        <input type="hidden" name="role" value={role} />

        <Field
          label="Full name"
          htmlFor="fullName"
          error={state.fieldErrors?.fullName}
          required
        >
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            required
            placeholder="Your full name"
            invalid={Boolean(state.fieldErrors?.fullName)}
          />
        </Field>

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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Password"
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
            label="Confirm password"
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
        </div>

        {role === "recruiter" ? <CompanyFields errors={state.fieldErrors} /> : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account..." : "Create account"}
        </Button>

        <p className="text-xs text-slate-500">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="font-medium text-royal hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-royal hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-royal hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function CompanyFields({ errors }: { errors?: Record<string, string> }) {
  return (
    <div className="space-y-4 rounded-2xl border border-sky-tint bg-royal-50/40 p-4">
      <Field
        label="Company name"
        htmlFor="companyName"
        error={errors?.companyName}
        required
      >
        <Input
          id="companyName"
          name="companyName"
          required
          placeholder="Acme Technologies Pvt Ltd"
          invalid={Boolean(errors?.companyName)}
        />
      </Field>
      <Field
        label="Company website"
        htmlFor="companyWebsite"
        error={errors?.companyWebsite}
        hint="Optional"
      >
        <Input
          id="companyWebsite"
          name="companyWebsite"
          type="url"
          placeholder="https://example.com"
        />
      </Field>
      <Field
        label="Company contact phone"
        htmlFor="phone"
        error={errors?.phone}
        hint="Optional; used to protect one free credit per company"
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          invalid={Boolean(errors?.phone)}
        />
      </Field>
      <p className="text-xs text-slate-600">
        Your first job post is free. Your company is reviewed before you can
        submit it; we will email you when verification is complete.
      </p>
    </div>
  );
}

function RoleOption({
  id,
  active,
  icon,
  title,
  description,
  onSelect,
}: {
  id: string;
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onSelect}
      aria-pressed={active}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
        active
          ? "border-royal bg-royal-50 shadow-soft"
          : "border-slate-300 bg-white hover:border-slate-400"
      }`}
    >
      <span className={active ? "text-royal" : "text-slate-400"}>{icon}</span>
      <span>
        <span className="block text-sm font-bold text-navy">{title}</span>
        <span className="block text-xs text-slate-600">{description}</span>
      </span>
    </button>
  );
}
