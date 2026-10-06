"use client";

import { useActionState } from "react";
import {
  convertToEmployerAction,
  switchToCandidateAction,
} from "@/lib/auth/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui/primitives";
import { formatIndianDateTime } from "@/lib/utils";

const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10000+",
];

export function BecomeEmployerForm({ premiumUntil }: { premiumUntil: Date | null }) {
  const [state, formAction, pending] = useActionState(
    convertToEmployerAction,
    initialFormState,
  );
  return (
    <Card>
      <h2 className="text-base font-bold text-navy">Become an employer</h2>
      <p className="mt-2 text-sm text-slate-600">
        Use your verified account to set up a company and hire. Your candidate
        profile, resumes and applications stay saved but are hidden from
        recruiters while you are an employer.
      </p>
      {premiumUntil ? (
        <Alert className="mt-4" tone="warning">
          Your candidate Premium subscription remains active until{" "}
          {formatIndianDateTime(premiumUntil)}.
          Converting does not cancel it.
        </Alert>
      ) : null}
      {state.status === "error" ? (
        <Alert className="mt-4" tone="error">{state.message}</Alert>
      ) : null}
      <form action={formAction} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="conversion-company-name" required error={state.fieldErrors?.companyName}>
            <Input id="conversion-company-name" name="companyName" required minLength={2} maxLength={160} />
          </Field>
          <Field label="Website" htmlFor="conversion-website" error={state.fieldErrors?.website}>
            <Input id="conversion-website" name="website" type="url" maxLength={200} placeholder="https://example.com" />
          </Field>
          <Field label="Phone" htmlFor="conversion-phone" error={state.fieldErrors?.phone}>
            <Input id="conversion-phone" name="phone" type="tel" maxLength={20} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Industry" htmlFor="conversion-industry" error={state.fieldErrors?.industry}>
            <Input id="conversion-industry" name="industry" maxLength={120} placeholder="Information technology" />
          </Field>
          <Field label="Company size" htmlFor="conversion-size" error={state.fieldErrors?.size}>
            <Select id="conversion-size" name="size" defaultValue="">
              <option value="">Select company size</option>
              {COMPANY_SIZES.map((size) => <option key={size} value={size}>{size} employees</option>)}
            </Select>
          </Field>
          <Field label="City" htmlFor="conversion-city" required error={state.fieldErrors?.city}>
            <Input id="conversion-city" name="city" required minLength={2} maxLength={120} />
          </Field>
        </div>
        <Field
          label="Type BECOME AN EMPLOYER to confirm"
          htmlFor="conversion-confirmation"
          required
          hint="Your account role will change. Candidate data remains stored but hidden from recruiter search."
          error={state.fieldErrors?.confirmation}
        >
          <Input id="conversion-confirmation" name="confirmation" required autoComplete="off" />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Converting..." : "Confirm and become an employer"}
        </Button>
      </form>
    </Card>
  );
}

export function SwitchToCandidateForm({ reason }: { reason: string | null }) {
  const [state, formAction, pending] = useActionState(
    switchToCandidateAction,
    initialFormState,
  );
  return (
    <Card>
      <h2 className="text-base font-bold text-navy">Switch back to candidate</h2>
      <p className="mt-2 text-sm text-slate-600">
        Your candidate profile will become available again, using its previous
        recruiter-search visibility setting.
      </p>
      {reason ? <Alert className="mt-4" tone="warning">{reason}</Alert> : null}
      {state.status === "error" ? (
        <Alert className="mt-4" tone="error">{state.message}</Alert>
      ) : null}
      <form action={formAction} className="mt-4">
        <Button type="submit" variant="secondary" disabled={pending || Boolean(reason)}>
          {pending ? "Switching..." : "Switch back to candidate"}
        </Button>
      </form>
    </Card>
  );
}
