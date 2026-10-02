import 'server-only';
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  companies,
  jobAlerts,
  jobs,
  PUBLIC_JOB_STATUSES,
  savedJobs,
  type JobAlertRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { normalizeSkillName } from '@/lib/portal/candidates/details';
import { cleanText } from '@/lib/portal/candidates/profile';

/**
 * Saved jobs and job alerts (see §11 and §12).
 *
 * Both are strictly candidate-owned: every function takes the candidate id
 * resolved from the session, so one candidate can never see or alter another's
 * saved jobs or alerts.
 *
 * ALERT DELIVERY IS NOT FAKED. An alert stores real criteria and
 * `matchJobsForAlert` is a real database query, but nothing here "sends" an
 * email: dispatching is a scheduled-worker concern wired up in Part 3, and
 * `lastSentAt` is only ever advanced by that worker.
 */

/**
 * Saves a job. The unique index on (candidate_id, job_id) makes a duplicate
 * save a no-op rather than an error, so a double-click cannot create two rows.
 */
export async function saveJob(candidateId: string, jobId: string): Promise<boolean> {
  const { db } = dbFromRequest();

  const [job] = await db
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);

  // Only a publicly visible job can be saved.
  if (!(PUBLIC_JOB_STATUSES as readonly string[]).includes(job.status)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);
  }

  const inserted = await db
    .insert(savedJobs)
    .values({ candidateId, jobId })
    .onConflictDoNothing()
    .returning({ id: savedJobs.id });

  return inserted.length > 0;
}

/** Removes a saved job. Scoped to the owner, so a foreign id matches nothing. */
export async function unsaveJob(candidateId: string, jobId: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.candidateId, candidateId), eq(savedJobs.jobId, jobId)))
    .returning({ id: savedJobs.id });
  return removed.length > 0;
}

export interface SavedJobDTO {
  jobId: string;
  title: string;
  companyName: string;
  location: string | null;
  workMode: string;
  employmentType: string;
  status: string;
  savedAt: string;
}

export async function listSavedJobs(
  candidateId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<SavedJobDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const rows = await db
    .select({
      jobId: savedJobs.jobId,
      title: jobs.title,
      companyName: companies.name,
      location: jobs.location,
      workMode: jobs.workMode,
      employmentType: jobs.employmentType,
      status: jobs.status,
      createdAt: savedJobs.createdAt,
    })
    .from(savedJobs)
    .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(savedJobs.candidateId, candidateId))
    .orderBy(desc(savedJobs.createdAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0));

  return rows.map((row) => ({
    jobId: row.jobId,
    title: row.title,
    companyName: row.companyName,
    location: row.location,
    workMode: row.workMode,
    employmentType: row.employmentType,
    status: row.status,
    savedAt: row.createdAt.toISOString(),
  }));
}

/** Ids of the candidate's saved jobs, used to mark the UI. */
export async function listSavedJobIds(candidateId: string): Promise<string[]> {
  const { db } = dbFromRequest();
  const rows = await db
    .select({ jobId: savedJobs.jobId })
    .from(savedJobs)
    .where(eq(savedJobs.candidateId, candidateId));
  return rows.map((row) => row.jobId);
}

/* -------------------------------------------------------------------------
 * Job alerts
 * ---------------------------------------------------------------------- */

export interface JobAlertInput {
  name: string;
  keywords?: string | null;
  location?: string | null;
  skills?: string[];
  experienceMinYears?: number | null;
  experienceMaxYears?: number | null;
  employmentType?: string | null;
  workMode?: string | null;
  frequency?: string;
  isActive?: boolean;
}

/** Creates an alert owned by the candidate. */
export async function createJobAlert(
  candidateId: string,
  input: JobAlertInput
): Promise<JobAlertRow> {
  const { db } = dbFromRequest();
  const name = cleanText(input.name, 120);
  if (!name) throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Alert name is required.');

  const frequency = input.frequency ?? 'daily';
  if (!['daily', 'weekly'].includes(frequency)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported alert frequency.');
  }

  const [row] = await db
    .insert(jobAlerts)
    .values({
      candidateId,
      name,
      keywords: cleanText(input.keywords, 200),
      location: cleanText(input.location, 120),
      skills: (input.skills ?? [])
        .map((skill) => {
          try {
            return normalizeSkillName(skill).name;
          } catch {
            return null;
          }
        })
        .filter((value): value is string => value !== null)
        .slice(0, 20),
      experienceMinYears: input.experienceMinYears ?? null,
      experienceMaxYears: input.experienceMaxYears ?? null,
      employmentType: input.employmentType ?? null,
      workMode: input.workMode ?? null,
      frequency,
      isActive: input.isActive ?? true,
    })
    .returning();

  return row;
}

/** Updates an alert, scoped to its owner. */
export async function updateJobAlert(
  candidateId: string,
  alertId: string,
  input: Partial<JobAlertInput>
): Promise<JobAlertRow> {
  const { db } = dbFromRequest();
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) patch.name = cleanText(input.name, 120);
  if (input.keywords !== undefined) patch.keywords = cleanText(input.keywords, 200);
  if (input.location !== undefined) patch.location = cleanText(input.location, 120);
  if (input.experienceMinYears !== undefined) {
    patch.experienceMinYears = input.experienceMinYears;
  }
  if (input.experienceMaxYears !== undefined) {
    patch.experienceMaxYears = input.experienceMaxYears;
  }
  if (input.employmentType !== undefined) patch.employmentType = input.employmentType;
  if (input.workMode !== undefined) patch.workMode = input.workMode;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.frequency !== undefined) {
    if (!['daily', 'weekly'].includes(input.frequency)) {
      throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported alert frequency.');
    }
    patch.frequency = input.frequency;
  }
  if (input.skills !== undefined) {
    patch.skills = (input.skills ?? []).map((skill) => skill.trim().toLowerCase()).slice(0, 20);
  }

  const [row] = await db
    .update(jobAlerts)
    .set(patch)
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.candidateId, candidateId)))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested alert was not found.', 404);
  return row;
}

export async function deleteJobAlert(candidateId: string, alertId: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(jobAlerts)
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.candidateId, candidateId)))
    .returning({ id: jobAlerts.id });
  return removed.length > 0;
}

export async function listJobAlerts(candidateId: string): Promise<JobAlertRow[]> {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(jobAlerts)
    .where(eq(jobAlerts.candidateId, candidateId))
    .orderBy(desc(jobAlerts.createdAt));
}

/**
 * Finds published jobs matching an alert's criteria. This is a REAL query, run
 * by the scheduled delivery worker in Part 3.
 */
export async function matchJobsForAlert(
  alert: JobAlertRow,
  options: { limit?: number; postedAfter?: Date } = {}
): Promise<Array<{ id: string; title: string; companyName: string }>> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const filters: ReturnType<typeof sql>[] = [
    sql`${jobs.status} IN ('published')`,
  ];

  if (alert.keywords) {
    const pattern = `%${alert.keywords.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(
      sql`(${ilike(jobs.title, pattern)} or ${ilike(jobs.description, pattern)})`
    );
  }
  if (alert.location) {
    filters.push(ilike(jobs.location, `%${alert.location}%`));
  }
  if (alert.employmentType) filters.push(sql`${jobs.employmentType} = ${alert.employmentType}`);
  if (alert.workMode) filters.push(sql`${jobs.workMode} = ${alert.workMode}`);
  if (alert.experienceMinYears !== null) {
    filters.push(
      sql`(${jobs.experienceMaxYears} IS NULL OR ${jobs.experienceMaxYears} >= ${alert.experienceMinYears})`
    );
  }
  if (alert.experienceMaxYears !== null) {
    filters.push(
      sql`(${jobs.experienceMinYears} IS NULL OR ${jobs.experienceMinYears} <= ${alert.experienceMaxYears})`
    );
  }
  for (const skill of alert.skills ?? []) {
    filters.push(
      sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${jobs.skills}) AS s WHERE s = ${skill})`
    );
  }
  if (options.postedAfter) {
    filters.push(sql`${jobs.publishedAt} >= ${options.postedAfter}`);
  }

  return db
    .select({ id: jobs.id, title: jobs.title, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...filters))
    .orderBy(desc(jobs.publishedAt))
    .limit(limit);
}

/** Active alerts, for the delivery worker. */
export async function listDueAlerts(now: Date = new Date()): Promise<JobAlertRow[]> {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(jobAlerts)
    .where(
      and(
        sql`${jobAlerts.isActive} = true`,
        sql`(${jobAlerts.lastSentAt} IS NULL OR ${jobAlerts.lastSentAt} < ${new Date(
          now.getTime() - 24 * 60 * 60 * 1000
        )})`
      )
    )
    .limit(500);
}

