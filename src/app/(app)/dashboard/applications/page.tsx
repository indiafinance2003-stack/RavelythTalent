import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companies, jobs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { withdrawApplicationAction } from "@/lib/applications/actions";
import {
  APPLICATION_STATUS_LABEL,
  formatDate,
} from "@/lib/utils";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "brand" | "success" | "warning" | "danger" | "neutral" | "teal"> = {
  applied: "brand",
  viewed: "teal",
  shortlisted: "success",
  interview: "teal",
  offered: "success",
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

export default async function ApplicationsPage() {
  const user = await requireUser("/dashboard");

  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      createdAt: applications.createdAt,
      statusChangedAt: applications.statusChangedAt,
      coverNote: applications.coverNote,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobSlug: jobs.slug,
      city: jobs.city,
      state: jobs.state,
      companyName: companies.name,
      companySlug: companies.slug,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(applications.candidateUserId, user.id))
    .orderBy(desc(applications.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My applications"
        description="Every role you applied to, with the latest status from the employer."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Apply to a job and it will appear here with live status updates."
          action={<ButtonLink href="/jobs">Find jobs</ButtonLink>}
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/jobs/${row.jobSlug}`}
                      className="text-base font-bold text-navy hover:text-royal"
                    >
                      {row.jobTitle}
                    </Link>
                    <p className="mt-0.5 text-sm text-slate-600">
                      <Link href={`/companies/${row.companySlug}`} className="hover:text-royal">
                        {row.companyName}
                      </Link>
                      {row.city ? ` - ${[row.city, row.state].filter(Boolean).join(", ")}` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
                    {APPLICATION_STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                </div>

                <dl className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold text-navy">Applied: </dt>
                    <dd className="inline">{formatDate(row.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-navy">Last update: </dt>
                    <dd className="inline">{formatDate(row.statusChangedAt)}</dd>
                  </div>
                </dl>

                {row.coverNote ? (
                  <p className="mt-3 rounded-xl bg-offwhite p-3 text-sm text-slate-600">
                    Your note: {row.coverNote}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/jobs/${row.jobSlug}`}
                    className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-navy hover:border-royal hover:text-royal"
                  >
                    View job
                  </Link>
                  {!["hired", "rejected", "withdrawn"].includes(row.status) ? (
                    <form action={withdrawApplicationAction}>
                      <input type="hidden" name="applicationId" value={row.id} />
                      <button
                        type="submit"
                        className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-slate-600 hover:border-red-300 hover:text-red-600"
                      >
                        Withdraw
                      </button>
                    </form>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
