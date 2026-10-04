"use client";

import { useActionState } from "react";
import {
  deleteResumeAction,
  setDefaultResumeAction,
  uploadResumeAction,
} from "@/lib/candidate/actions";
import { initialFormState } from "@/lib/form-state";
import { formatDate } from "@/lib/utils";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui/primitives";

export type ResumeRow = {
  id: string;
  label: string | null;
  originalName: string;
  sizeBytes: number;
  createdAt: Date;
  isDefault: boolean;
};

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeManager({ resumes }: { resumes: ResumeRow[] }) {
  const [state, formAction, pending] = useActionState(
    uploadResumeAction,
    initialFormState,
  );

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-base font-bold text-navy">Upload a resume</h2>
        <p className="mt-1 text-sm text-slate-600">
          PDF, DOC or DOCX, up to 5 MB. Files are stored privately and are only
          visible to you and employers you apply to.
        </p>

        <form action={formAction} className="mt-4 space-y-4">
          {state.status === "success" ? (
            <Alert tone="success">{state.message}</Alert>
          ) : null}
          {state.status === "error" ? (
            <Alert tone="error">{state.message}</Alert>
          ) : null}

          <Field label="Label (optional)" htmlFor="label">
            <Input id="label" name="label" placeholder="e.g. Product Marketing Resume" />
          </Field>

          <Field label="Resume file" htmlFor="resume" required>
            <input
              id="resume"
              name="resume"
              type="file"
              required
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-royal file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? "Uploading..." : "Upload resume"}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-navy">Your resumes</h2>
        {resumes.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            You have not uploaded a resume yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {resumes.map((resume) => (
              <li key={resume.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-navy">
                    {resume.label ?? resume.originalName}
                  </p>
                  <p className="text-xs text-slate-600">
                    {resume.originalName} &middot; {sizeLabel(resume.sizeBytes)} &middot;{" "}
                    {formatDate(resume.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {resume.isDefault ? <Badge tone="success">Default</Badge> : null}
                  <a
                    href={`/api/files/resumes/${resume.id}`}
                    target="_blank"
                    rel="noopener"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal hover:text-royal"
                  >
                    View
                  </a>
                  {!resume.isDefault ? (
                    <form action={setDefaultResumeAction}>
                      <input type="hidden" name="resumeId" value={resume.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal hover:text-royal"
                      >
                        Make default
                      </button>
                    </form>
                  ) : null}
                  <form action={deleteResumeAction}>
                    <input type="hidden" name="resumeId" value={resume.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
