import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { markJobReportReviewedAction } from "@/lib/admin/actions";
import { listOpenJobReports } from "@/lib/jobs/reports";
import { formatIndianDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Job reports" };

const REASON_LABELS: Record<string, string> = {
  scam_or_asks_for_money: "Scam or asks for money",
  fake_or_already_filled: "Fake or already filled",
  discriminatory: "Discriminatory",
  other: "Other",
};

export default async function AdminReportsPage() {
  const reports = await listOpenJobReports();
  return (
    <div className="space-y-6">
      <PageHeader title="Job reports" description="Review reports submitted by visitors and signed-in users." />
      {reports.length === 0 ? (
        <EmptyState title="No open reports" description="New job reports will appear here." />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-navy">
                    <Link className="hover:text-royal" href={`/jobs/${report.jobSlug}`}>
                      {report.jobTitle}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{report.companyName} · {report.reporterCount} distinct reporter(s)</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">
                  {REASON_LABELS[report.reason] ?? report.reason}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Reported by {report.reporterName ?? "Visitor"}{report.reporterEmail ? ` (${report.reporterEmail})` : ""} · {formatIndianDateTime(report.createdAt)}
              </p>
              {report.note ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{report.note}</p> : null}
              <form action={markJobReportReviewedAction} className="mt-4 border-t border-slate-200 pt-4">
                <input name="reportId" type="hidden" value={report.id} />
                <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">
                  Mark reviewed
                </button>
              </form>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
