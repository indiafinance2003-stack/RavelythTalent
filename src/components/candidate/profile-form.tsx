"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/lib/candidate/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Card, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";

export type ProfileValues = {
  headline: string | null;
  summary: string | null;
  currentLocation: string | null;
  currentCompany: string | null;
  currentDesignation: string | null;
  totalExperienceMonths: number | null;
  noticePeriodDays: number | null;
  expectedSalaryLpa: number | null;
  preferredLocations: string[];
  discoverable: boolean;
};

export function ProfileForm({ values }: { values: ProfileValues }) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialFormState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <h2 className="text-base font-bold text-navy">About you</h2>
        <div className="mt-4 space-y-4">
          {state.status === "success" ? (
            <Alert tone="success">{state.message}</Alert>
          ) : null}
          {state.status === "error" ? (
            <Alert tone="error">{state.message}</Alert>
          ) : null}

          <Field label="Professional headline" htmlFor="headline">
            <Input
              id="headline"
              name="headline"
              defaultValue={values.headline ?? ""}
              placeholder="Senior Product Designer"
              maxLength={160}
            />
          </Field>

          <Field
            label="Summary"
            htmlFor="summary"
            hint="A short introduction recruiters will see first."
          >
            <Textarea id="summary" name="summary" rows={5} maxLength={4000}
              defaultValue={values.summary ?? ""} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current location" htmlFor="currentLocation">
              <Input id="currentLocation" name="currentLocation"
                defaultValue={values.currentLocation ?? ""} placeholder="Bengaluru" />
            </Field>
            <Field label="Total experience (months)" htmlFor="totalExperienceMonths">
              <Input id="totalExperienceMonths" name="totalExperienceMonths" type="number"
                min={0} max={900} defaultValue={values.totalExperienceMonths ?? ""} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Current company" htmlFor="currentCompany">
              <Input id="currentCompany" name="currentCompany"
                defaultValue={values.currentCompany ?? ""} />
            </Field>
            <Field label="Current designation" htmlFor="currentDesignation">
              <Input id="currentDesignation" name="currentDesignation"
                defaultValue={values.currentDesignation ?? ""} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Notice period (days)" htmlFor="noticePeriodDays">
              <Input id="noticePeriodDays" name="noticePeriodDays" type="number"
                min={0} max={365} defaultValue={values.noticePeriodDays ?? ""} />
            </Field>
            <Field label="Expected salary (LPA)" htmlFor="expectedSalaryLpa">
              <Input id="expectedSalaryLpa" name="expectedSalaryLpa" type="number"
                min={0} step={0.5}
                defaultValue={values.expectedSalaryLpa ?? ""} placeholder="12" />
            </Field>
          </div>

          <Field
            label="Preferred locations"
            htmlFor="preferredLocations"
            hint="Comma separated, for example: Bengaluru, Hyderabad"
          >
            <Input id="preferredLocations" name="preferredLocations"
              defaultValue={values.preferredLocations.join(", ")} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-navy">Privacy</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recruiters on Professional and above plans can search the resume
          database. You stay hidden until you switch this on.
        </p>
        <div className="mt-4">
          <Checkbox
            id="discoverable"
            name="discoverable"
            defaultChecked={values.discoverable}
            label="Allow verified recruiters to find me in the resume database"
          />
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
