import { count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  candidateProfiles,
  candidateSkills,
  companies,
  jobSkills,
  jobs,
  savedJobs,
  skills,
} from "@/lib/db/schema";
import { listAlerts } from "@/lib/alerts/service";
import { listCandidateInterviews } from "@/lib/interviews/service";
import {
  computeJobMatch,
  hasEnoughMatchData,
  type MatchProfile,
  type MatchResult,
} from "@/lib/jobs/match";
import { getLatestJobs, type JobCard } from "@/lib/jobs/queries";

/* -------------------------------------------------------------------------- */
/* Applications                                                                */
/* -------------------------------------------------------------------------- */

export type CandidateApplicationSummary = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  recent: Array<{
    id: string;
    status: string;
    createdAt: Date;
    jobTitle: string;
    jobSlug: string;
    companyName: string;
  }>;
};

export async function getApplicationSummary(
  userId: string,
  recentLimit = 5,
): Promise<CandidateApplicationSummary> {
  const [statusRows, recentRows] = await Promise.all([
    db
      .select({ status: applications.status, count: count() })
      .from(applications)
      .where(eq(applications.candidateUserId, userId))
      .groupBy(applications.status),
    db
      .select({
        id: applications.id,
        status: applications.status,
        createdAt: applications.createdAt,
        jobTitle: jobs.title,
        jobSlug: jobs.slug,
        companyName: companies.name,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(applications.candidateUserId, userId))
      .orderBy(desc(applications.createdAt))
      .limit(recentLimit),
  ]);

  return {
    total: statusRows.reduce((sum, row) => sum + row.count, 0),
    byStatus: statusRows.map((row) => ({ status: row.status, count: row.count })),
    recent: recentRows,
  };
}

/* -------------------------------------------------------------------------- */
/* Interviews                                                                  */
/* -------------------------------------------------------------------------- */

const UPCOMING_STATUSES = ["scheduled", "confirmed", "rescheduled"] as const;

/** The candidate's next interviews that have not happened or been cancelled. */
export async function getUpcomingInterviews(
  candidateUserId: string,
  limit = 3,
) {
  const rows = await listCandidateInterviews(candidateUserId);
  const now = Date.now();
  return rows
    .filter(
      (row) =>
        row.scheduledAt.getTime() >= now &&
        (UPCOMING_STATUSES as readonly string[]).includes(row.status),
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Job matches                                                                 */
/* -------------------------------------------------------------------------- */

export async function getMatchProfile(userId: string): Promise<MatchProfile | null> {
  const profile = (
    await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, userId))
      .limit(1)
  ).at(0);
  if (!profile) return null;

  const skillRows = await db
    .select({ name: skills.name })
    .from(candidateSkills)
    .innerJoin(skills, eq(skills.id, candidateSkills.skillId))
    .where(eq(candidateSkills.candidateProfileId, profile.id));

  return {
    skills: skillRows.map((row) => row.name),
    location: profile.currentLocation,
    preferredLocations: profile.preferredLocations ?? [],
    experienceMonths: profile.totalExperienceMonths,
  };
}

export type RecommendedJob = { job: JobCard; match: MatchResult };

/**
 * Latest published jobs the candidate has not applied to, scored with the
 * deterministic match model and sorted best-first. Empty until a profile exists.
 */
export async function getRecommendedJobs(
  userId: string,
  limit = 3,
): Promise<RecommendedJob[]> {
  const profile = await getMatchProfile(userId);
  if (!profile || !hasEnoughMatchData(profile)) return [];

  const pool = await getLatestJobs(Math.max(12, limit * 4));
  const appliedRows = await db
    .select({ jobId: applications.jobId })
    .from(applications)
    .where(eq(applications.candidateUserId, userId));
  const appliedIds = new Set(appliedRows.map((row) => row.jobId));
  const open = pool.filter((job) => !appliedIds.has(job.id));
  if (open.length === 0) return [];

  const skillRows = await db
    .select({ jobId: jobSkills.jobId, name: skills.name })
    .from(jobSkills)
    .innerJoin(skills, eq(skills.id, jobSkills.skillId))
    .where(inArray(jobSkills.jobId, open.map((job) => job.id)));
  const skillsByJob = new Map<string, string[]>();
  for (const row of skillRows) {
    const list = skillsByJob.get(row.jobId) ?? [];
    list.push(row.name);
    skillsByJob.set(row.jobId, list);
  }

  const scored = open.map((job) => ({
    job,
    match: computeJobMatch(
      {
        city: job.city,
        state: job.state,
        workMode: job.workMode,
        skills: skillsByJob.get(job.id) ?? [],
        experienceMinYears: toNumber(job.experienceMinYears),
        experienceMaxYears: toNumber(job.experienceMaxYears),
      },
      profile,
    ),
  }));

  scored.sort(
    (a, b) =>
      b.match.score - a.match.score ||
      b.job.createdAt.getTime() - a.job.createdAt.getTime(),
  );
  return scored.slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Small counters                                                             */
/* -------------------------------------------------------------------------- */

export async function getSavedJobsCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(savedJobs)
    .where(eq(savedJobs.userId, userId));
  return row?.value ?? 0;
}

export async function getAlertsSummary(
  userId: string,
): Promise<{ total: number; active: number }> {
  const alerts = await listAlerts(userId);
  return {
    total: alerts.length,
    active: alerts.filter((alert) => alert.isActive).length,
  };
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
