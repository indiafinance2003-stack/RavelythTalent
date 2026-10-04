import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";
import { getCompanyPlan } from "@/lib/entitlements";
import { resolveRecruiterCompany } from "@/lib/recruiter/service";
import {
  getCompanyApplicationSources,
  getCompanyJobReports,
  getCompanyTimeToHire,
} from "@/lib/recruiter/reports";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hiring reports" };

export default async function RecruiterReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter/reports");
  const { company: companyIdParam } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyIdParam);
  if (!company) {
    return <EmptyState title="Set up your company first" description="Reports are available after creating a recruiter company." />;
  }

  const plan = await getCompanyPlan(company.id);
  if (!plan?.features.get("reports_basic")?.enabled) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hiring reports" description="See how your jobs are performing." />
        <Card>
          <p className="font-semibold text-navy">Reports require an active employer plan.</p>
          <Link className="mt-3 inline-block text-sm font-semibold text-royal hover:underline" href="/pricing?audience=employer">Compare employer plans</Link>
        </Card>
      </div>
    );
  }

  const enhanced = Boolean(plan.features.get("reports_enhanced")?.enabled);
  const [jobs, sources, timeToHire] = await Promise.all([
    getCompanyJobReports(company.id),
    enhanced ? getCompanyApplicationSources(company.id) : Promise.resolve([]),
    enhanced ? getCompanyTimeToHire(company.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Hiring reports" description={`Performance for ${company.name}.`} />
      <Card>
        <h2 className="mb-4 text-base font-bold text-navy">Job performance</h2>
        {jobs.length === 0 ? <p className="text-sm text-slate-600">No job data available yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-2">Job</th><th>Status</th><th>Views</th><th>Applications</th><th>Conversion</th><th>Posted</th></tr></thead>
              <tbody>
                {jobs.map((job) => (
                  <tr className="border-b border-slate-100" key={job.id}>
                    <td className="py-3 font-semibold text-navy">{job.title}</td>
                    <td>{job.status}</td><td>{job.views}</td><td>{job.applications}</td>
                    <td>{job.conversionPercent}%</td><td>{formatDate(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {enhanced ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-base font-bold text-navy">Application sources</h2>
            {sources.length === 0 ? <p className="text-sm text-slate-600">No source data recorded yet.</p> : sources.map((row) => (
              <p className="flex justify-between border-b border-slate-100 py-2 text-sm" key={row.source}><span>{row.source}</span><strong>{row.applications} applications</strong></p>
            ))}
          </Card>
          <Card>
            <h2 className="mb-3 text-base font-bold text-navy">Time to hire</h2>
            {timeToHire.length === 0 ? <p className="text-sm text-slate-600">No hires recorded yet.</p> : timeToHire.map((row) => (
              <p className="flex justify-between border-b border-slate-100 py-2 text-sm" key={row.jobTitle}><span>{row.jobTitle} ({row.hiredCandidates})</span><strong>{row.averageDays} days</strong></p>
            ))}
          </Card>
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-600">Traffic sources and time-to-hire reports are available on eligible plans.</p>
        </Card>
      )}
    </div>
  );
}
