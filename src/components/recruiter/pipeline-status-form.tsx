"use client";

import { useActionState } from "react";
import { changeApplicationStatusAction } from "@/lib/recruiter/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button } from "@/components/ui/primitives";

const OPTIONS = [
  { value: "viewed", label: "Viewed" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "offered", label: "Offered" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
];

/** Inline per-applicant status changer (client wrapper around the server action). */
export function ApplicantStatusForm({
  applicationId,
  current,
}: {
  applicationId: string;
  current: string;
}) {
  const [state, formAction, pending] = useActionState(changeApplicationStatusAction, initialFormState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label htmlFor={`status-${applicationId}`} className="sr-only">
        Change applicant status
      </label>
      <select
        id={`status-${applicationId}`}
        name="status"
        defaultValue={current}
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-navy disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Saving..." : "Update"}
      </Button>
      {state.status === "error" ? (
        <span className="w-full text-xs font-medium text-red-600">{state.message}</span>
      ) : null}
      {state.status === "success" ? (
        <span className="sr-only" role="status">{state.message}</span>
      ) : null}
    </form>
  );
}

export function PipelineAlert({ status, message }: { status: string; message?: string }) {
  if (status !== "error" || !message) return null;
  return <Alert tone="error">{message}</Alert>;
}
