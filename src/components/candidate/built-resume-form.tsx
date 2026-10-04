"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { initialFormState } from "@/lib/form-state";
import { saveBuiltResumeAction } from "@/lib/candidate/builder-actions";
import type { BuiltResumeData, ResumeTemplate } from "@/lib/candidate/resume-pdf";

export function BuiltResumeForm({
  resumeId,
  title,
  template,
  data,
  premium,
  professionalTemplates,
}: {
  resumeId?: string;
  title: string;
  template: ResumeTemplate;
  data: BuiltResumeData;
  premium: boolean;
  professionalTemplates: boolean;
}) {
  const [state, action, pending] = useActionState(saveBuiltResumeAction, initialFormState);

  return (
    <form action={action} className="space-y-5">
      {state.message ? (
        <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>
      ) : null}
      <input type="hidden" name="resumeId" value={resumeId ?? ""} />
      <Field label="Resume title" htmlFor="resume-title" required>
        <Input id="resume-title" name="title" defaultValue={title} maxLength={120} required />
      </Field>
      <Field
        label="Template"
        htmlFor="resume-template"
        hint={!professionalTemplates ? "Your plan includes the Classic template preview." : undefined}
      >
        <Select
          id="resume-template"
          name="template"
          defaultValue={premium ? template : "classic"}
          disabled={!premium}
        >
          <option value="classic">Classic</option>
          {professionalTemplates ? (
            <>
              <option value="modern">Modern</option>
              <option value="minimal">Minimal</option>
            </>
          ) : null}
        </Select>
        {!professionalTemplates ? <input type="hidden" name="template" value="classic" /> : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="resume-full-name">
          <Input id="resume-full-name" name="fullName" defaultValue={data.fullName} maxLength={120} />
        </Field>
        <Field label="Professional headline" htmlFor="resume-headline">
          <Input id="resume-headline" name="headline" defaultValue={data.headline} maxLength={160} />
        </Field>
        <Field label="Email" htmlFor="resume-email">
          <Input id="resume-email" name="email" type="email" defaultValue={data.email} maxLength={254} />
        </Field>
        <Field label="Phone" htmlFor="resume-phone">
          <Input id="resume-phone" name="phone" defaultValue={data.phone} maxLength={40} />
        </Field>
        <Field label="Location" htmlFor="resume-location">
          <Input id="resume-location" name="location" defaultValue={data.location} maxLength={160} />
        </Field>
      </div>
      <Field label="Professional summary" htmlFor="resume-summary">
        <Textarea id="resume-summary" name="summary" defaultValue={data.summary} maxLength={3000} />
      </Field>
      <Field
        label="Experience"
        htmlFor="resume-experience"
        hint="Add roles in reverse chronological order, with dates and achievements."
      >
        <Textarea id="resume-experience" name="experience" defaultValue={data.experience} maxLength={8000} />
      </Field>
      <Field label="Education" htmlFor="resume-education">
        <Textarea id="resume-education" name="education" defaultValue={data.education} maxLength={5000} />
      </Field>
      <Field label="Skills" htmlFor="resume-skills" hint="Separate skills with commas or line breaks.">
        <Textarea id="resume-skills" name="skills" defaultValue={data.skills} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save resume"}
        </Button>
        {!premium ? (
          <Link className="text-sm font-semibold text-royal hover:underline" href="/pricing">
            Unlock PDF downloads and more templates
          </Link>
        ) : null}
      </div>
    </form>
  );
}
