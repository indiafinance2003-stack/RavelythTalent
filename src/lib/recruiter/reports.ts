import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationStatusHistory, applications, jobs } from "@/lib/db/schema";

export async function getCompanyJobReports(companyId: string) {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      views: jobs.viewsCount,
      applications: jobs.applicationsCount,
      createdAt: jobs.createdAt,
      conversionPercent: sql<number>`case when ${jobs.viewsCount} = 0 then 0 else round(100.0 * ${jobs.applicationsCount} / ${jobs.viewsCount}, 1) end`,
    })
    .from(jobs)
    .where(eq(jobs.companyId, companyId))
    .orderBy(desc(jobs.createdAt))
    .limit(200);
}

export async function getCompanyApplicationSources(companyId: string) {
  return db
    .select({
      source: sql<string>`coalesce(${applications.source}, 'direct')`,
      applications: count(),
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(jobs.companyId, companyId))
    .groupBy(applications.source)
    .orderBy(desc(count()));
}

export async function getCompanyTimeToHire(companyId: string) {
  return db
    .select({
      jobTitle: jobs.title,
      hiredCandidates: count(),
      averageDays: sql<number>`round(avg(extract(epoch from (${applicationStatusHistory.createdAt} - ${applications.createdAt})) / 86400)::numeric, 1)`,
    })
    .from(applicationStatusHistory)
    .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(sql`${jobs.companyId} = ${companyId} and ${applicationStatusHistory.toStatus} = 'hired'`)
    .groupBy(jobs.id, jobs.title)
    .orderBy(desc(count()))
    .limit(100);
}
