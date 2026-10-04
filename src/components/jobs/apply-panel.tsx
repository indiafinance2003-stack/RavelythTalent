"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2, Upload } from "lucide-react";
import { applyAction, toggleSavedJobAction } from "@/lib/applications/actions";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Select, Textarea } from "@/components/ui/primitives";

export type ApplyResumeOption = { id: string; label: string };

export function ApplyPanel({
  jobId,
  signedIn,
  verified,
  alreadyApplied,
  saved,
  resumes,
}: {
  jobId: string;
  signedIn: boolean;
  verified: boolean;
  alreadyApplied: boolean;
  saved: boolean;
  resumes: ApplyResumeOption[];
}) {
  const [state, formAction, pending] = useActionState(applyAction, initialFormState);
  const [isSaved, setIsSaved] = useState(saved);
  const [savingBusy, setSavingBusy] = useState(false);

  async function onToggleSave() {
    setSavingBusy(true);
    const formData = new FormData();
    formData.set("jobId", jobId);
    try {
      const result = await toggleSavedJobAction(formData);
      setIsSaved(result.saved);
    } finally {
      setSavingBusy(false);
    }
  }

  return (
    <div id="apply" className="surface space-y-4 p-5">
      {alreadyApplied ? (
        <div className="rounded-xl border border-teal/40 bg-teal-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-navy">
            <CheckCircle2 className="h-4 w-4 text-teal" aria-hidden="true" />
            You have applied to this job
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Track the progress from your dashboard.
          </p>
          <Link
            href="/dashboard/applications"
            className="mt-3 inline-block rounded-xl bg-royal px-4 py-2 text-sm font-semibold text-white"
          >
            Track application
          </Link>
        </div>
      ) : !signedIn ? (
        <div>
          <p className="text-sm text-slate-600">
            Sign in to apply. It takes less than a minute to create an account.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(`/jobs/${jobId}#apply`)}`}
              className="rounded-xl bg-royal px-4 py-2 text-sm font-semibold text-white"
            >
              Sign in to apply
            </Link>
            <Link
              href="/register"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-navy"
            >
              Create account
            </Link>
          </div>
        </div>
      ) : !verified ? (
        <Alert tone="warning" title="Verify your email first">
          Your email address is not verified yet, so applications are disabled.
        </Alert>
      ) : (
        <form action={formAction} className="space-y-4">
          {state.status === "success" ? (
            <Alert tone="success">{state.message}</Alert>
          ) : null}
          {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}

          <input type="hidden" name="jobId" value={jobId} />

          <div className="space-y-1.5">
            <label htmlFor="resumeId" className="block text-sm font-semibold text-navy">
              Resume
            </label>
            {resumes.length > 0 ? (
              <Select id="resumeId" name="resumeId" defaultValue={resumes[0]?.id}>
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.label}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-offwhite p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-navy">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  You have not uploaded a resume yet
                </p>
                <p className="mt-1 text-slate-600">
                  You can still apply - recruiters will see your profile. Adding a
                  resume improves your chances.
                </p>
                <Link
                  href="/dashboard/resumes"
                  className="mt-2 inline-block font-semibold text-royal hover:underline"
                >
                  Upload a resume
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="coverNote" className="block text-sm font-semibold text-navy">
              Cover note <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <Textarea
              id="coverNote"
              name="coverNote"
              rows={4}
              maxLength={2000}
              placeholder="Briefly tell the employer why you are a good fit."
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Submitting..." : "Easy Apply"}
          </Button>
        </form>
      )}

      {signedIn && !alreadyApplied ? (
        <button
          type="button"
          onClick={onToggleSave}
          disabled={savingBusy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-royal hover:text-royal disabled:opacity-60"
        >
          <Bookmark
            className={`h-4 w-4 ${isSaved ? "fill-royal text-royal" : ""}`}
            aria-hidden="true"
          />
          {isSaved ? "Saved - click to remove" : "Save this job"}
        </button>
      ) : null}
    </div>
  );
}