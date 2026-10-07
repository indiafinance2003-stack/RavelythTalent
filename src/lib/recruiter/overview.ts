import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { interviews, jobs, users } from "@/lib/db/schema";
import {
  listCompanyApplications,
  type PipelineRow,
} from "@/lib/recruiter/service";

/** Application statuses that count as an upcoming interview. */
const UPCOMING_INTERVIEW_STATUSES = ["scheduled", "confirmed", "rescheduled"] as const;

/* -------------------------------------------------------------------------- */
/* Views vs applications                                                       */
/* -------------------------------------------------------------------------- */

export type JobFunnelRow = {
  jobId: string;
  title: string;
  views: number;
  applications: number;
};

/** Top jobs by views, for the "views vs applications" chart. */
export async function getJobFunnel(
  companyId: string,
  limit = 6,
): Promise<JobFunnelRow[]> {
  const rows = await db
    .select({
      jobId: jobs.id,
      title: jobs.title,
      views: jobs.viewsCount,
      applications: jobs.applicationsCount,
    })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), isNull(jobs.deletedAt)))
    .orderBy(desc(sql`greatest(${jobs.viewsCount}, ${jobs.applicationsCount})`))
    .limit(limit);
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Interviews                                                                  */
/* -------------------------------------------------------------------------- */

export type CompanyInterview = {
  id: string;
  scheduledAt: Date;
  status: string;
  mode: string;
  durationMinutes: number | null;
  meetingLink: string | null;
  jobTitle: string;
  candidateName: string;
};

export async function getCompanyUpcomingInterviews(
  companyId: string,
  limit = 3,
): Promise<CompanyInterview[]> {
  return db
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      status: interviews.status,
      mode: interviews.mode,
      durationMinutes: interviews.durationMinutes,
      meetingLink: interviews.meetingLink,
      jobTitle: jobs.title,
      candidateName: users.fullName,
    })
    .from(interviews)
    .innerJoin(jobs, eq(jobs.id, interviews.jobId))
    .innerJoin(users, eq(users.id, interviews.candidateUserId))
    .where(
      and(
        eq(interviews.companyId, companyId),
        gte(interviews.scheduledAt, new Date()),
        inArray(interviews.status, [...UPCOMING_INTERVIEW_STATUSES]),
      ),
    )
    .orderBy(interviews.scheduledAt)
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Recent applicants (pipeline board source)                                   */
/* -------------------------------------------------------------------------- */

export async function getBoardApplicants(
  companyId: string,
  limit = 30,
): Promise<PipelineRow[]> {
  return listCompanyApplications({ companyId, limit, recentFirst: true });
}
