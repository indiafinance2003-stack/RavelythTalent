import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { confirmInterviewAction } from "@/lib/interviews/actions";
import { listCandidateInterviews } from "@/lib/interviews/service";
import { requireUser } from "@/lib/auth/current-user";
import { formatIndianDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My interviews" };

const MODE_LABEL: Record<string, string> = {
  video: "Video",
  phone: "Phone",
  in_person: "In person",
};

export default async function CandidateInterviewsPage() {
  const candidate = await requireUser("/dashboard/interviews");
  const rows = await listCandidateInterviews(candidate.id);

  return (
    <div className="space-y-6">
      <PageHeader title="My interviews" description="Review invitations and confirm upcoming interviews." />
      {rows.length === 0 ? (
        <EmptyState title="No interviews scheduled" description="When an employer invites you to interview, the details will appear here." />
      ) : rows.map((interview) => (
        <Card key={interview.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy">{interview.jobTitle}</h2>
              <p className="text-sm text-slate-600">{interview.companyName} · {MODE_LABEL[interview.mode] ?? interview.mode}</p>
            </div>
            <Badge tone={interview.status === "confirmed" ? "success" : "warning"}>{interview.status}</Badge>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="inline font-semibold text-navy">When: </dt><dd className="inline text-slate-700">{formatIndianDateTime(interview.scheduledAt)}</dd></div>
            <div><dt className="inline font-semibold text-navy">Duration: </dt><dd className="inline text-slate-700">{interview.durationMinutes} minutes</dd></div>
            {interview.meetingLink ? <div className="sm:col-span-2"><dt className="inline font-semibold text-navy">Meeting link: </dt><dd className="inline"><a className="break-all text-royal underline" href={interview.meetingLink} rel="noreferrer" target="_blank">{interview.meetingLink}</a></dd></div> : null}
            {interview.location ? <div className="sm:col-span-2"><dt className="inline font-semibold text-navy">Location: </dt><dd className="inline text-slate-700">{interview.location}</dd></div> : null}
          </dl>
          {interview.notes ? <p className="mt-4 whitespace-pre-wrap rounded-xl bg-offwhite p-3 text-sm text-slate-700">{interview.notes}</p> : null}
          {interview.candidateNotes ? <p className="mt-2 text-sm text-slate-600">Your note: {interview.candidateNotes}</p> : null}
          {interview.status === "scheduled" || interview.status === "rescheduled" ? (
            <form action={confirmInterviewAction} className="mt-5 border-t border-slate-200 pt-4">
              <input name="interviewId" type="hidden" value={interview.id} />
              <label className="block text-sm font-medium text-navy">
                Optional note for the hiring team
                <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={1000} name="candidateNotes" />
              </label>
              <button className="mt-3 rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">Confirm interview</button>
            </form>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
