import Link from "next/link";
import { ApplicantStatusForm } from "@/components/recruiter/pipeline-status-form";
import { startEmployerConversationAction } from "@/lib/chat/actions/create-conversation";
import type { PipelineRow } from "@/lib/recruiter/service";
import { APPLICATION_STATUS_LABEL, formatDate } from "@/lib/utils";
import { Alert, Badge, ButtonLink, EmptyState } from "@/components/ui/primitives";

const FILTERS = ["", "applied", "viewed", "shortlisted", "interview", "offered", "hired", "rejected"];

export function PipelineFilters({
  jobId,
  status,
  jobs,
}: {
  jobId?: string;
  status?: string;
  jobs: Array<{ id: string; title: string }>;
}) {
  return (
    <div className="space-y-3">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <label htmlFor="pipeline-job" className="text-sm font-semibold text-navy">Job</label>
        <select id="pipeline-job" name="job" defaultValue={jobId ?? ""}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-navy">
          <option value="">All jobs</option>
          {jobs.map((j) => (<option key={j.id} value={j.id}>{j.title}</option>))}
        </select>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button type="submit"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-navy hover:border-royal">
          Filter
        </button>
      </form>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (jobId) params.set("job", jobId);
          if (f) params.set("status", f);
          const qs = params.toString();
          return (
            <Link key={f || "all"} href={qs ? `/recruiter/applications?${qs}` : "/recruiter/applications"}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${((status ?? "") === f) ? "bg-royal text-white" : "border border-slate-300 bg-white text-navy hover:border-royal"}`}>
              {f ? (APPLICATION_STATUS_LABEL[f] ?? f) : "All"}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PipelineList({
  rows,
  jobId,
  jobs,
  chatEnabled = false,
}: {
  rows: PipelineRow[];
  jobId?: string;
  jobs: Array<{ id: string; title: string }>;
  chatEnabled?: boolean;
}) {
  const activeKnown = !jobId || jobs.some((j) => j.id === jobId);
  return (
    <div className="space-y-4">
      {jobId && !activeKnown ? (
        <Alert tone="warning" title="Unknown job filter">That job is not in this company. Showing all jobs.</Alert>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="No applicants match" description="Try clearing the job or status filter."
          action={<ButtonLink href="/recruiter/applications" variant="secondary">Clear filters</ButtonLink>} />
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="surface space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-navy">{a.candidateName}</p>
                    {a.isPremium ? <Badge tone="success">Premium</Badge> : null}
                  </div>
                  <p className="text-sm text-slate-600">{a.headline ?? "Candidate"}{a.location ? ` · ${a.location}` : ""}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Applied to <Link href={`/recruiter/jobs/${a.jobId}`} className="font-semibold text-royal hover:underline">{a.jobTitle}</Link>
                    {" "}· {formatDate(a.createdAt)}
                  </p>
                  {a.coverNote ? (<p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">&ldquo;{a.coverNote}&rdquo;</p>) : null}
                </div>
                <Badge tone={a.status === "rejected" ? "danger" : a.status === "hired" ? "success" : "neutral"}>
                  {APPLICATION_STATUS_LABEL[a.status] ?? a.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                <ApplicantStatusForm applicationId={a.id} current={a.status} />
                {chatEnabled ? (
                  <form action={startEmployerConversationAction}>
                    <input type="hidden" name="applicationId" value={a.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal"
                    >
                      Message
                    </button>
                  </form>
                ) : null}
                {a.status === "shortlisted" || a.status === "interview" ? (
                  <Link href={`/recruiter/interviews?application=${a.id}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal">
                    Schedule interview
                  </Link>
                ) : null}
                {a.resumeId ? (
                  <Link href={`/api/files/resumes/${a.resumeId}`} target="_blank" rel="noreferrer"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal">
                    View resume
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
