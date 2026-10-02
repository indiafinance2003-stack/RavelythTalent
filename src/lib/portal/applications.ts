import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  APPLICATION_STATUSES,
  applicationStatusHistory,
  candidateProfiles,
  companies,
  jobApplications,
  jobs,
  resumeVersions,
  resumes,
  type ApplicationStatus,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import { applicationRejectionReason } from '@/lib/portal/jobs/lifecycle';

/**
 * Job applications (see §10).
 *
 * Authorization model:
 *  - A candidate may only act on their OWN applications; the candidate id is
 *    always resolved from the session, never from the request body.
 *  - An employer may only see applications to jobs belonging to THEIR company.
 *    The company filter lives in the SQL WHERE clause, so a guessed application
 *    id returns nothing rather than another company's applicant (no IDOR).
 *  - Admins may read across the platform.
 *
 * Integrity:
 *  - The unique index on (job_id, candidate_id) prevents duplicate applications
 *    even under concurrent requests.
 *  - Every status change writes a history row, so the pipeline is
 *    reconstructable after the fact.
 */

export interface ApplicationDTO {
  id: string;
  jobId: string;
  jobTitle: string;
  companyId: string;
  companyName: string;
  candidateId: string;
  candidateName: string;
  resumeVersionId: string | null;
  coverLetter: string | null;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
}

/** Projection shared by every application listing. */
const applicationProjection = {
  application: jobApplications,
  jobTitle: jobs.title,
  companyId: jobs.companyId,
  companyName: companies.name,
  candidateName: candidateProfiles.fullName,
};

type ApplicationRow = {
  application: typeof jobApplications.$inferSelect;
  jobTitle: string;
  companyId: string;
  companyName: string;
  candidateName: string;
};

function toApplicationDTO(row: ApplicationRow): ApplicationDTO {
  return {
    id: row.application.id,
    jobId: row.application.jobId,
    jobTitle: row.jobTitle,
    companyId: row.companyId,
    companyName: row.companyName,
    candidateId: row.application.candidateId,
    candidateName: row.candidateName,
    resumeVersionId: row.application.resumeVersionId,
    coverLetter: row.application.coverLetter,
    status: row.application.status as ApplicationStatus,
    appliedAt: row.application.appliedAt.toISOString(),
    updatedAt: row.application.updatedAt.toISOString(),
  };
}

export function assertApplicationStatus(value: string): asserts value is ApplicationStatus {
  if (!(APPLICATION_STATUSES as readonly string[]).includes(value)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, `Unsupported application status: ${value}`);
  }
}

/**
 * Resolves a resume version id to one actually owned by this candidate.
 *
 * A version belonging to someone else is dropped rather than attached, so an
 * employer can never be handed another candidate's document by guessing an id.
 */
async function resolveOwnedResume(
  candidateProfileId: string,
  resumeVersionId: string | null | undefined
): Promise<string | null> {
  if (!resumeVersionId) return null;
  const { db } = dbFromRequest();
  const owned = await db
    .select({ id: resumeVersions.id })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(and(eq(resumeVersions.id, resumeVersionId), eq(resumes.candidateId, candidateProfileId)))
    .limit(1);
  return owned.length > 0 ? resumeVersionId : null;
}

/**
 * Applies a candidate to a job.
 *
 * Server-side checks, in order: the job exists and is published, it is still
 * accepting applications, the deadline has not passed, the supplied resume
 * belongs to this candidate, and the candidate has not already applied.
 */
export async function applyToJob(input: {
  /** Resolved from the session, never from the request body. */
  candidateProfileId: string;
  jobId: string;
  resumeVersionId?: string | null;
  coverLetter?: string | null;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}): Promise<ApplicationDTO> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  // A non-published job is indistinguishable from a missing one.
  if (!job || job.status !== 'published') {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);
  }

  const rejection = applicationRejectionReason(
    { status: job.status, applicationDeadline: job.applicationDeadline, expiresAt: job.expiresAt },
    now
  );
  if (rejection) {
    throw new AppError(AppErrorCode.CONFLICT, rejection, 409);
  }

  const resumeVersionId = await resolveOwnedResume(input.candidateProfileId, input.resumeVersionId);

  const [existing] = await db
    .select({ id: jobApplications.id })
    .from(jobApplications)
    .where(
      and(eq(jobApplications.jobId, input.jobId), eq(jobApplications.candidateId, input.candidateProfileId))
    )
    .limit(1);
  if (existing) {
    throw new AppError(AppErrorCode.CONFLICT, 'You have already applied to this job.', 409);
  }

  const [created] = await db
    .insert(jobApplications)
    .values({
      jobId: input.jobId,
      candidateId: input.candidateProfileId,
      resumeVersionId,
      coverLetter: input.coverLetter?.slice(0, 5000) ?? null,
      status: 'applied',
      appliedAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(applicationStatusHistory).values({
    applicationId: created.id,
    fromStatus: null,
    toStatus: 'applied',
    createdAt: now,
  });

  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, job.companyId))
    .limit(1);
  const [candidate] = await db
    .select({ fullName: candidateProfiles.fullName })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.id, input.candidateProfileId))
    .limit(1);

  return toApplicationDTO({
    application: created,
    jobTitle: job.title,
    companyId: job.companyId,
    companyName: company?.name ?? '',
    candidateName: candidate?.fullName ?? '',
  });
}

/** Applications for one candidate, newest first. Always owner-scoped. */
export async function listCandidateApplications(
  candidateProfileId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ApplicationDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await db
    .select(applicationProjection)
    .from(jobApplications)
    .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .innerJoin(candidateProfiles, eq(jobApplications.candidateId, candidateProfiles.id))
    .where(eq(jobApplications.candidateId, candidateProfileId))
    .orderBy(desc(jobApplications.appliedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(toApplicationDTO);
}

/**
 * Applications for one company, newest first.
 *
 * `companyId` MUST come from the authenticated employer session; the join to
 * `jobs` is what restricts visibility to this company's postings.
 */
export async function listCompanyApplications(
  companyId: string,
  options: { jobId?: string; status?: ApplicationStatus; limit?: number; offset?: number } = {}
): Promise<ApplicationDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const filters = [eq(jobs.companyId, companyId)];
  if (options.jobId) filters.push(eq(jobApplications.jobId, options.jobId));
  if (options.status) filters.push(eq(jobApplications.status, options.status));

  const rows = await db
    .select(applicationProjection)
    .from(jobApplications)
    .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .innerJoin(candidateProfiles, eq(jobApplications.candidateId, candidateProfiles.id))
    .where(and(...filters))
    .orderBy(desc(jobApplications.appliedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(toApplicationDTO);
}

/**
 * Changes an application status.
 *
 * `companyId` is the caller's own company (from the session). The lookup is
 * scoped to applications whose job belongs to that company, so a status change
 * can never be applied to another employer's applicant.
 */
export async function updateApplicationStatus(input: {
  applicationId: string;
  nextStatus: ApplicationStatus;
  /** Caller's own company id; ignored when `isAdmin` is true. */
  companyId?: string;
  isAdmin?: boolean;
  changedByUserId: string;
  note?: string | null;
  employerNotes?: string | null;
  now?: Date;
}): Promise<ApplicationDTO> {
  assertApplicationStatus(input.nextStatus);
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  // The transaction holds ONLY the business work. The audit entry is written
  // after the commit so it can never hold the transaction open (and so a
  // single-connection pool cannot deadlock against a non-transactional query).
  const audited = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        application: jobApplications,
        jobCompanyId: jobs.companyId,
        jobTitle: jobs.title,
        candidateName: candidateProfiles.fullName,
      })
      .from(jobApplications)
      .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
      .innerJoin(candidateProfiles, eq(jobApplications.candidateId, candidateProfiles.id))
      .where(eq(jobApplications.id, input.applicationId))
      .limit(1);

    if (!row) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'The requested application was not found.', 404);
    }

    // Tenant check: an employer may only touch its own company's applications.
    if (!input.isAdmin && row.jobCompanyId !== input.companyId) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'The requested application was not found.', 404);
    }

    const [updated] = await tx
      .update(jobApplications)
      .set({
        status: input.nextStatus,
        updatedAt: now,
        ...(input.employerNotes !== undefined ? { employerNotes: input.employerNotes } : {}),
      })
      .where(eq(jobApplications.id, input.applicationId))
      .returning();

    await tx.insert(applicationStatusHistory).values({
      applicationId: input.applicationId,
      fromStatus: row.application.status,
      toStatus: input.nextStatus,
      changedByUserId: input.changedByUserId,
      note: input.note?.slice(0, 1000) ?? null,
      createdAt: now,
    });

    const [company] = await tx
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, row.jobCompanyId))
      .limit(1);

    return {
      dto: toApplicationDTO({
        application: updated,
        jobTitle: row.jobTitle,
        companyId: row.jobCompanyId,
        companyName: company?.name ?? '',
        candidateName: row.candidateName,
      }),
      from: row.application.status,
      jobId: row.application.jobId,
    };
  });

  await recordPortalAudit({
    action: 'application_status_changed',
    actorUserId: input.changedByUserId,
    description: `Application moved from ${audited.from} to ${input.nextStatus}`,
    metadata: {
      applicationId: input.applicationId,
      jobId: audited.jobId,
      from: audited.from,
      to: input.nextStatus,
    },
  });

  return audited.dto;
}

export interface StatusHistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

/** Status history for one application (test item 39). */
export async function getApplicationHistory(
  applicationId: string
): Promise<StatusHistoryEntry[]> {
  const { db } = dbFromRequest();
  const rows = await db
    .select()
    .from(applicationStatusHistory)
    .where(eq(applicationStatusHistory.applicationId, applicationId))
    .orderBy(applicationStatusHistory.createdAt);

  return rows.map((row) => ({
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Platform-wide listing, for admin oversight only. */
export async function listAllApplications(
  options: { status?: ApplicationStatus; limit?: number; offset?: number } = {}
): Promise<ApplicationDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await db
    .select(applicationProjection)
    .from(jobApplications)
    .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .innerJoin(candidateProfiles, eq(jobApplications.candidateId, candidateProfiles.id))
    .where(options.status ? eq(jobApplications.status, options.status) : undefined)
    .orderBy(desc(jobApplications.appliedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(toApplicationDTO);
}

