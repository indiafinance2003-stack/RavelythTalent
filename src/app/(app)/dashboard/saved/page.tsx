import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { getSavedJobsForUser } from "@/lib/jobs/queries";
import { unsaveJobAction } from "@/lib/applications/actions";
import { JobCardView } from "@/components/jobs/job-card";
import {
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function SavedJobsPage() {
  const user = await requireUser("/dashboard");
  const jobs = await getSavedJobsForUser(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved jobs"
        description="Roles you bookmarked for later."
        action={<ButtonLink href="/jobs">Find more jobs</ButtonLink>}
      />

      {jobs.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Save a job while browsing and it will show up here."
          action={<ButtonLink href="/jobs">Browse jobs</ButtonLink>}
        />
      ) : (
        <>
          <ul className="space-y-4">
            {jobs.map((job) => (
              <li key={job.id} className="relative">
                <JobCardView job={job} />
                <form
                  action={unsaveJobAction}
                  className="absolute right-4 top-4"
                >
                  <input type="hidden" name="jobId" value={job.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <Card>
            <h2 className="text-sm font-bold text-navy">Tip</h2>
            <p className="mt-1 text-sm text-slate-600">
              Turn on{" "}
              <Link
                href="/dashboard/alerts"
                className="font-semibold text-royal hover:underline"
              >
                job alerts
              </Link>{" "}
              and new matching jobs will reach your inbox automatically.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
