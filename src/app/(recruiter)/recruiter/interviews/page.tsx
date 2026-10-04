import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/current-user";
import { requireCompanyMembership } from "@/lib/entitlements";
import { scheduleInterviewAction } from "@/lib/interviews/actions";
import { getInterviewApplication } from "@/lib/interviews/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Schedule an interview" };

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

export default async function RecruiterInterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ application?: string }>;
}) {
  const user = await requireUser("/recruiter/interviews");
  const { application: applicationId } = await searchParams;
  if (!applicationId) notFound();
  const application = await getInterviewApplication(applicationId);
  if (!application) notFound();
  await requireCompanyMembership(user.id, application.companyId);

  return (
    <div className="space-y-6">
      <PageHeader title="Schedule interview" description={`${application.jobTitle} · ${application.candidateName} · ${application.companyName}`} />
      <Card>
        <form action={scheduleInterviewAction} className="grid gap-4 md:grid-cols-2">
          <input name="applicationId" type="hidden" value={application.id} />
          <label className="text-sm font-medium text-navy">
            Date and time (India time)
            <input className={fieldClass} name="scheduledAt" required type="datetime-local" />
          </label>
          <label className="text-sm font-medium text-navy">
            Duration (minutes)
            <input className={fieldClass} defaultValue={30} max="240" min="15" name="durationMinutes" required type="number" />
          </label>
          <label className="text-sm font-medium text-navy">
            Interview mode
            <select className={`${fieldClass} bg-white`} defaultValue="video" name="mode">
              <option value="video">Video</option>
              <option value="phone">Phone</option>
              <option value="in_person">In person</option>
            </select>
          </label>
          <label className="text-sm font-medium text-navy">
            Meeting link (required for video)
            <input className={fieldClass} maxLength={1000} name="meetingLink" type="url" />
          </label>
          <label className="text-sm font-medium text-navy md:col-span-2">
            Location (required for in-person interviews)
            <input className={fieldClass} maxLength={500} name="location" />
          </label>
          <label className="text-sm font-medium text-navy md:col-span-2">
            Notes for the candidate
            <textarea className={fieldClass} maxLength={2000} name="notes" rows={4} />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button className="rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy" type="submit">Send interview invitation</button>
            <Link className="text-sm font-semibold text-royal hover:underline" href="/recruiter/applications">Back to applicants</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
