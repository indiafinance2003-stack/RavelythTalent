"use client";

import { ApplicantStatusForm } from "@/components/recruiter/pipeline-status-form";
import { StatusChip, type BadgeTone } from "@/components/dashboard/kit";
import { APPLICATION_STATUS_LABEL, formatDate, labelFor } from "@/lib/utils";

export const PIPELINE_COLUMNS = [
  "applied",
  "viewed",
  "shortlisted",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
] as const;

const COLUMN_TONE: Record<string, BadgeTone> = {
  applied: "brand",
  viewed: "teal",
  shortlisted: "navy",
  interview: "brand",
  offered: "success",
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

export type BoardApplicant = {
  id: string;
  status: string;
  candidateName: string;
  jobTitle: string;
  appliedAt: Date;
  isPremium: boolean;
};

/**
 * Kanban-style pipeline: one column per application status, one card per
 * applicant with an inline status changer. Counts come from the database so a
 * truncated board never shows misleading numbers.
 */
export function PipelineBoard({
  applicants,
  counts,
}: {
  applicants: BoardApplicant[];
  counts: Record<string, number>;
}) {
  const grouped = new Map<string, BoardApplicant[]>(
    PIPELINE_COLUMNS.map((column) => [column, []]),
  );
  for (const applicant of applicants) {
    const key = (PIPELINE_COLUMNS as readonly string[]).includes(applicant.status)
      ? applicant.status
      : "withdrawn";
    grouped.get(key)?.push(applicant);
  }

  if (applicants.length === 0) return null;

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex min-w-max gap-3">
        {PIPELINE_COLUMNS.map((column) => {
          const rows = grouped.get(column) ?? [];
          return (
            <section
              aria-label={`${labelFor(APPLICATION_STATUS_LABEL, column)} applicants`}
              className="w-64 shrink-0 rounded-2xl bg-slate-50 p-3"
              key={column}
            >
              <header className="mb-3 flex items-center justify-between gap-2">
                <StatusChip tone={COLUMN_TONE[column] ?? "neutral"}>
                  {labelFor(APPLICATION_STATUS_LABEL, column)}
                </StatusChip>
                <span className="text-xs font-bold text-slate-500">
                  {counts[column] ?? rows.length}
                </span>
              </header>

              <ul className="space-y-3">
                {rows.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs font-medium text-slate-400">
                    None here
                  </li>
                ) : (
                  rows.map((applicant) => (
                    <li className="surface space-y-2 p-3" key={applicant.id}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-bold text-navy">
                          {applicant.candidateName}
                        </p>
                        {applicant.isPremium ? (
                          <StatusChip tone="success">Premium</StatusChip>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-slate-600">
                        {applicant.jobTitle}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Applied {formatDate(applicant.appliedAt)}
                      </p>
                      <ApplicantStatusForm
                        applicationId={applicant.id}
                        current={applicant.status}
                      />
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
