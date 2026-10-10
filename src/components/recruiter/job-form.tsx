"use client";

import { useActionState, useState } from "react";
import { saveJobAction } from "@/lib/recruiter/actions";
import { initialFormState } from "@/lib/form-state";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

export type JobFormValues = {
  title: string;
  description: string;
  responsibilities: string;
  requirements: string;
  categoryId: string;
  jobType: string;
  workMode: string;
  city: string;
  state: string;
  salaryMinRupees: string;
  salaryMaxRupees: string;
  salaryPeriod: string;
  salaryHidden: boolean;
  experienceMinYears: string;
  experienceMaxYears: string;
  stipendType: string;
  stipendMinRupees: string;
  stipendMaxRupees: string;
  durationMonths: string;
  startDate: string;
  eligibility: string;
  ppoPossible: boolean;
  certificateProvided: boolean;
  openings: number;
  deadline: string;
};

export const EMPTY_JOB_VALUES: JobFormValues = {
  title: "",
  description: "",
  responsibilities: "",
  requirements: "",
  categoryId: "",
  jobType: "full_time",
  workMode: "onsite",
  city: "",
  state: "",
  salaryMinRupees: "",
  salaryMaxRupees: "",
  salaryPeriod: "year",
  salaryHidden: false,
  experienceMinYears: "",
  experienceMaxYears: "",
  stipendType: "",
  stipendMinRupees: "",
  stipendMaxRupees: "",
  durationMonths: "",
  startDate: "",
  eligibility: "",
  ppoPossible: false,
  certificateProvided: false,
  openings: 1,
  deadline: "",
};

export type CategoryOption = { id: string; name: string };

/**
 * Create-job form. Two intents on the same form: `Save draft` (intent=draft)
 * and `Submit for approval` (intent=submit) - both land in `saveJobAction`.
 */
export function JobForm({
  companyId,
  jobId,
  categories,
  values = EMPTY_JOB_VALUES,
  fieldErrors = {},
  mode = "create",
  locked = false,
}: {
  companyId: string;
  jobId?: string;
  categories: CategoryOption[];
  values?: JobFormValues;
  fieldErrors?: Record<string, string>;
  mode?: "create" | "edit";
  locked?: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveJobAction, initialFormState);

  // Repopulate after a validation failure (server echoes `values` back).
  const v: JobFormValues = state.values
    ? ({ ...values, ...(state.values as Partial<JobFormValues>) } as JobFormValues)
    : values;
  const errors = { ...fieldErrors, ...(state.fieldErrors ?? {}) };
  const [jobType, setJobType] = useState(v.jobType);
  const isInternship = jobType === "internship";
  const [stipendType, setStipendType] = useState(v.stipendType);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {jobId ? <input type="hidden" name="jobId" value={jobId} /> : null}

      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
      {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}

      {locked ? (
        <Alert tone="warning" title="Read-only">
          This job is closed or expired and can no longer be edited.
        </Alert>
      ) : null}
      <fieldset disabled={locked || pending} className="space-y-6 disabled:opacity-70">
      <Card>
        <h2 className="text-base font-bold text-navy">Role details</h2>
        <div className="mt-4 space-y-4">
          <Field label="Job title" htmlFor="title" required error={errors.title}>
            <Input id="title" name="title" defaultValue={v.title} required maxLength={150} placeholder="Senior Backend Engineer" />
          </Field>

          <Field label="Description" htmlFor="description" required error={errors.description} hint="Responsibilities, day-to-day work, team context. 40 characters minimum.">
            <Textarea id="description" name="description" rows={8} required maxLength={20000} defaultValue={v.description} />
          </Field>

          <Field label="Key responsibilities" htmlFor="responsibilities" hint="One per line." error={errors.responsibilities}>
            <Textarea id="responsibilities" name="responsibilities" rows={5} maxLength={8000} defaultValue={v.responsibilities} />
          </Field>

          <Field label="Requirements" htmlFor="requirements" hint="Skills, experience, education. One per line." error={errors.requirements}>
            <Textarea id="requirements" name="requirements" rows={5} maxLength={8000} defaultValue={v.requirements} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Category" htmlFor="categoryId">
              <Select id="categoryId" name="categoryId" defaultValue={v.categoryId}>
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Job type" htmlFor="jobType">
              <Select
                id="jobType"
                name="jobType"
                value={jobType}
                onChange={(event) => setJobType(event.target.value)}
              >
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
                <option value="temporary">Temporary</option>
                <option value="freelance">Freelance</option>
              </Select>
            </Field>
            <Field label="Work mode" htmlFor="workMode">
              <Select id="workMode" name="workMode" defaultValue={v.workMode}>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-navy">Location & compensation</h2>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city" error={errors.city}>
              <Input id="city" name="city" defaultValue={v.city} maxLength={120} placeholder="Bengaluru" />
            </Field>
            <Field label="State" htmlFor="state" error={errors.state}>
              <Input id="state" name="state" defaultValue={v.state} maxLength={120} placeholder="Karnataka" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Salary from (₹)" htmlFor="salaryMinRupees" error={errors.salaryMinRupees}>
              <Input id="salaryMinRupees" name="salaryMinRupees" type="number" min={0} max={1000000000} defaultValue={v.salaryMinRupees} placeholder="800000" />
            </Field>
            <Field label="Salary to (₹)" htmlFor="salaryMaxRupees" error={errors.salaryMaxRupees}>
              <Input id="salaryMaxRupees" name="salaryMaxRupees" type="number" min={0} max={1000000000} defaultValue={v.salaryMaxRupees} placeholder="1400000" />
            </Field>
            <Field label="Period" htmlFor="salaryPeriod">
              <Select id="salaryPeriod" name="salaryPeriod" defaultValue={v.salaryPeriod}>
                <option value="year">per year</option>
                <option value="month">per month</option>
                <option value="day">per day</option>
                <option value="hour">per hour</option>
              </Select>
            </Field>
          </div>

          <Checkbox id="salaryHidden" name="salaryHidden" defaultChecked={values.salaryHidden} label="Hide salary from the public posting" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Experience from (years)" htmlFor="experienceMinYears" error={errors.experienceMinYears}>
              <Input id="experienceMinYears" name="experienceMinYears" type="number" min={0} max={50} step={0.5} defaultValue={v.experienceMinYears} placeholder="3" />
            </Field>
            <Field label="Experience to (years)" htmlFor="experienceMaxYears" error={errors.experienceMaxYears}>
              <Input id="experienceMaxYears" name="experienceMaxYears" type="number" min={0} max={50} step={0.5} defaultValue={v.experienceMaxYears} placeholder="6" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Openings" htmlFor="openings" required error={errors.openings}>
              <Input id="openings" name="openings" type="number" min={1} max={500} defaultValue={v.openings} required />
            </Field>
            <Field label="Apply by" htmlFor="deadline" hint="Optional. Leave empty for open-ended.">
              <Input id="deadline" name="deadline" type="date" defaultValue={v.deadline} />
            </Field>
          </div>
        </div>
      </Card>

      {isInternship ? (
        <Card>
          <h2 className="text-base font-bold text-navy">Internship details</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Stipend type" htmlFor="stipendType" required error={errors.stipendType}>
                <Select
                  id="stipendType"
                  name="stipendType"
                  value={stipendType}
                  onChange={(event) => setStipendType(event.target.value)}
                >
                  <option value="">Choose…</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="performance_based">Performance-based</option>
                </Select>
              </Field>
              <Field label="Duration (months)" htmlFor="durationMonths" required error={errors.durationMonths}>
                <Input id="durationMonths" name="durationMonths" type="number" min={1} max={60} defaultValue={v.durationMonths} placeholder="6" required />
              </Field>
              <Field label="Preferred start date" htmlFor="startDate">
                <Input id="startDate" name="startDate" type="date" defaultValue={v.startDate} />
              </Field>
            </div>

            {stipendType !== "unpaid" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Stipend from (₹/month)" htmlFor="stipendMinRupees" error={errors.stipendMinRupees}>
                  <Input id="stipendMinRupees" name="stipendMinRupees" type="number" min={0} max={10000000} defaultValue={v.stipendMinRupees} placeholder="15000" />
                </Field>
                <Field label="Stipend to (₹/month)" htmlFor="stipendMaxRupees" error={errors.stipendMaxRupees}>
                  <Input id="stipendMaxRupees" name="stipendMaxRupees" type="number" min={0} max={10000000} defaultValue={v.stipendMaxRupees} placeholder="20000" />
                </Field>
              </div>
            ) : (
              <>
                <input type="hidden" name="stipendMinRupees" value="" />
                <input type="hidden" name="stipendMaxRupees" value="" />
              </>
            )}

            <Field label="Eligibility" htmlFor="eligibility" hint="Who can apply - degree, year, skills. Optional." error={errors.eligibility}>
              <Textarea id="eligibility" name="eligibility" rows={3} maxLength={4000} defaultValue={v.eligibility} />
            </Field>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
              <Checkbox id="ppoPossible" name="ppoPossible" defaultChecked={values.ppoPossible} label="Pre-placement offer (PPO) possible" />
              <Checkbox id="certificateProvided" name="certificateProvided" defaultChecked={values.certificateProvided} label="Certificate provided" />
            </div>
          </div>
        </Card>
      ) : null}
      </fieldset>

      {mode === "edit" ? (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending || locked}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      ) : (
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="draft" disabled={pending}>
          {pending ? "Saving..." : "Save draft"}
        </Button>
        <Button type="submit" name="intent" value="submit" variant="secondary" disabled={pending}>
          Submit for approval
        </Button>
      </div>
      )}
      <p className="text-xs text-slate-500">
        Drafts are private. Submitting consumes one job post from your monthly quota
        and sends the posting for admin review.
      </p>
    </form>
  );
}
