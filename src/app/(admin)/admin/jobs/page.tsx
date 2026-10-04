import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { decideJobAction } from "@/lib/admin/actions";
import { listJobReviewQueue } from "@/lib/admin/moderation";

export const metadata: Metadata = { title: "Job moderation" };

export default async function AdminJobsPage() {
  const queue = await listJobReviewQueue();

  return (
    <div className="space-y-6">
      <PageHeader title="Job moderation" description="Approve job postings before they become visible to candidates." />
      {queue.length === 0 ? (
        <EmptyState title="No pending jobs" description="Submitted jobs from approved companies will appear here." />
      ) : (
        <div className="space-y-4">
          {queue.map((job) => (
            <Card key={job.id}>
              <h2 className="text-lg font-bold text-navy">{job.title}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {job.companyName} · Submitted by {job.recruiterName ?? "Recruiter"}{job.recruiterEmail ? ` (${job.recruiterEmail})` : ""}
                {job.city || job.state ? ` · ${[job.city, job.state].filter(Boolean).join(", ")}` : ""}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{job.description}</p>
              {job.responsibilities ? <p className="mt-3 text-sm"><strong>Responsibilities:</strong> {job.responsibilities}</p> : null}
              {job.requirements ? <p className="mt-2 text-sm"><strong>Requirements:</strong> {job.requirements}</p> : null}
              <p className="mt-3 text-xs text-slate-500">Submitted {job.createdAt.toLocaleDateString("en-IN")}</p>
              <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                <form action={decideJobAction}>
                  <input name="id" type="hidden" value={job.id} />
                  <input name="decision" type="hidden" value="approved" />
                  <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">Approve and publish</button>
                </form>
                <form action={decideJobAction} className="space-y-2">
                  <input name="id" type="hidden" value={job.id} />
                  <input name="decision" type="hidden" value="rejected" />
                  <label className="block text-sm font-medium text-navy">
                    Rejection reason
                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={1000} required name="reason" />
                  </label>
                  <button className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" type="submit">Reject</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
