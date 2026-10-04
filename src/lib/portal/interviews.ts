import 'server-only';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import type { AppDatabase } from '@/lib/db';
import {
  applicationStatusHistory,
  interviewHistory,
  interviews,
  jobApplications,
  jobs,
  candidateProfiles,
  INTERVIEW_MODES,
  INTERVIEW_STATUSES,
  type InterviewMode,
  type InterviewRow,
  type InterviewStatus,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { requirePlanFeature } from '@/lib/portal/recruiter-plans/service';

/**
 * Interviews (see §9 of the brief).
 *
 * An interview belongs to an APPLICATION: that is what lets both sides see it
 * in context ("your interview for Backend Engineer at Acme") and what makes the
 * authorisation question answerable — the employer may see it because they own
 * the application's job, the candidate because they own the application.
 *
 * The rules enforced here:
 *
 *  1. EMPLOYER SCOPE IS DERIVED FROM THE JOB. Every employer-facing operation
 *     resolves the interview through `interviews.company_id`, so one company
 *     can never touch another's schedule even with a valid uuid.
 *  2. SCHEDULING IS A PLAN CAPABILITY. `interview_management` is checked before
 *     any write, so the feature is a permission rather than marketing copy.
 *  3. HISTORY IS APPEND-ONLY. Every schedule/reschedule/decision lands in
 *     `interview_history`, so "who moved this and when" survives the edit.
 *  4. INTERVIEWER NOTES NEVER LEAK. `notes` is employer-only; the candidate DTO
 *     is built by a separate mapping that cannot include it.
 */

type DbExecutor = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export interface InterviewContextDTO {
  jobTitle: string;
  candidateName: string;
}

export interface InterviewDTO extends InterviewContextDTO {
  id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  companyId: string;
  round: number;
  mode: InterviewMode;
  scheduledAt: string;
  durationMinutes: number;
  locationOrLink: string | null;
  /** Interviewer notes. Present ONLY in employer-facing DTOs. */
  notes?: string | null;
  status: InterviewStatus;
  createdAt: string;
  updatedAt: string;
}

export function isInterviewMode(value: string): value is InterviewMode {
  return (INTERVIEW_MODES as readonly string[]).includes(value);
}

export function isInterviewStatus(value: string): value is InterviewStatus {
  return (INTERVIEW_STATUSES as readonly string[]).includes(value);
}

interface JoinedRow {
  interview: InterviewRow;
  jobTitle: string;
  candidateName: string;
}

function toEmployerDTO(row: JoinedRow): InterviewDTO {
  return {
    id: row.interview.id,
    applicationId: row.interview.applicationId,
    jobId: row.interview.jobId,
    candidateId: row.interview.candidateId,
    companyId: row.interview.companyId,
    round: row.interview.round,
    mode: row.interview.mode as InterviewMode,
    scheduledAt: row.interview.scheduledAt.toISOString(),
    durationMinutes: row.interview.durationMinutes,
    locationOrLink: row.interview.locationOrLink,
    notes: row.interview.notes,
    status: row.interview.status as InterviewStatus,
    createdAt: row.interview.createdAt.toISOString(),
    updatedAt: row.interview.updatedAt.toISOString(),
    jobTitle: row.jobTitle,
    candidateName: row.candidateName,
  };
}

/**
 * The candidate's view. Structurally cannot carry `notes`: interviewer
 * feedback is not something a candidate DTO is ever allowed to express.
 */
function toCandidateDTO(row: JoinedRow): Omit<InterviewDTO, 'notes'> {
  const { notes: _notes, ...rest } = toEmployerDTO(row);
  return rest;
}

/** Appends one history entry. Best-effort: history must not fail a request. */
async function recordHistoryWith(
  executor: DbExecutor,
  input: {
    interviewId: string;
    eventType: string;
    scheduledAt?: Date | null;
    note?: string | null;
    actorUserId?: string | null;
  }
): Promise<void> {
  try {
    await executor.insert(interviewHistory).values({
      interviewId: input.interviewId,
      eventType: input.eventType,
      scheduledAt: input.scheduledAt ?? null,
      note: input.note ?? null,
      actorUserId: input.actorUserId ?? null,
    });
  } catch {
    // The business change is what matters; history is secondary to it.
  }
}

/**
 * Resolves an application through the caller's company.
 *
 * The join on `jobs.company_id` is the authorisation: an application id from
 * another tenant simply does not resolve, and the caller sees 404 rather than
 * a hint that the id exists somewhere else.
 */
async function loadApplicationForCompany(
  executor: DbExecutor,
  applicationId: string,
  companyId: string
): Promise<{ applicationId: string; jobId: string; candidateId: string; status: string; jobTitle: string }> {
  const [row] = await executor
    .select({
      applicationId: jobApplications.id,
      jobId: jobApplications.jobId,
      candidateId: jobApplications.candidateId,
      status: jobApplications.status,
      jobTitle: jobs.title,
    })
    .from(jobApplications)
    .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
    .where(and(eq(jobApplications.id, applicationId), eq(jobs.companyId, companyId)))
    .limit(1);
  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested application was not found.', 404);
  }
  return row;
}

/** Resolves one interview through the caller's company. */
async function loadInterviewForCompany(
  executor: DbExecutor,
  interviewId: string,
  companyId: string
): Promise<JoinedRow> {
  const [row] = await executor
    .select({
      interview: interviews,
      jobTitle: jobs.title,
      candidateName: candidateProfiles.fullName,
    })
    .from(interviews)
    .innerJoin(jobs, eq(interviews.jobId, jobs.id))
    .innerJoin(candidateProfiles, eq(interviews.candidateId, candidateProfiles.id))
    .where(and(eq(interviews.id, interviewId), eq(interviews.companyId, companyId)))
    .limit(1);
  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested interview was not found.', 404);
  }
  return row;
}

/**
 * Schedules an interview for an application.
 *
 * Scheduling also moves the application to 'interview' when it was still
 * applied/shortlisted — the pipeline status and the calendar must agree, or
 * the employer sees a candidate "waiting for review" who is already booked.
 * Terminal application states are never touched: an employer cannot resurrect
 * a rejected application by scheduling an interview for it.
 */
export async function scheduleInterview(input: {
  companyId: string;
  applicationId: string;
  actorUserId: string;
  mode: InterviewMode;
  scheduledAt: Date;
  durationMinutes?: number;
  round?: number;
  locationOrLink?: string | null;
  notes?: string | null;
}): Promise<InterviewRow> {
  // The plan capability is checked before anything is written.
  await requirePlanFeature(input.companyId, 'interview_management');

  const { db } = dbFromRequest();
  const scheduledAt = input.scheduledAt;
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'scheduledAt is not a valid date.', 400);
  }

  return db.transaction(async (tx) => {
    const application = await loadApplicationForCompany(
      tx,
      input.applicationId,
      input.companyId
    );

    // A rejected/hired application is closed: schedule nothing against it.
    if (application.status === 'rejected' || application.status === 'hired') {
      throw new AppError(
        AppErrorCode.CONFLICT,
        'This application is closed and cannot be scheduled for an interview.',
        409
      );
    }

    // Rounds auto-increment per application unless explicitly chosen.
    let round = input.round;
    if (round === undefined) {
      const [{ next }] = await tx
        .select({ next: sql<number>`COALESCE(MAX(${interviews.round}), 0) + 1` })
        .from(interviews)
        .where(eq(interviews.applicationId, input.applicationId));
      round = Number(next) || 1;
    }

    const [row] = await tx
      .insert(interviews)
      .values({
        applicationId: application.applicationId,
        jobId: application.jobId,
        candidateId: application.candidateId,
        companyId: input.companyId,
        scheduledByUserId: input.actorUserId,
        round,
        mode: input.mode,
        scheduledAt,
        durationMinutes: Math.min(Math.max(input.durationMinutes ?? 30, 5), 480),
        locationOrLink: input.locationOrLink?.trim() || null,
        notes: input.notes?.trim() || null,
        status: 'scheduled',
      })
      .returning();

    await recordHistoryWith(tx, {
      interviewId: row.id,
      eventType: 'scheduled',
      scheduledAt,
      note: `Round ${round} scheduled.`,
      actorUserId: input.actorUserId,
    });

    // Keep the pipeline in step with the calendar — but never touch a terminal
    // application state.
    if (application.status === 'applied' || application.status === 'shortlisted') {
      await tx
        .update(jobApplications)
        .set({ status: 'interview', updatedAt: new Date() })
        .where(eq(jobApplications.id, application.applicationId));
      await tx.insert(applicationStatusHistory).values({
        applicationId: application.applicationId,
        fromStatus: application.status,
        toStatus: 'interview',
        changedByUserId: input.actorUserId,
        note: `Interview round ${round} scheduled.`,
      });
    }

    return row;
  });
}

/**
 * Reschedules a live interview.
 *
 * Only a 'scheduled' interview can move: a completed or cancelled interview is
 * a historical fact, and editing its time would falsify the record.
 */
export async function rescheduleInterview(input: {
  companyId: string;
  interviewId: string;
  actorUserId: string;
  scheduledAt: Date;
  durationMinutes?: number;
  mode?: InterviewMode;
  locationOrLink?: string | null;
  note?: string | null;
}): Promise<InterviewRow> {
  await requirePlanFeature(input.companyId, 'interview_management');

  if (Number.isNaN(input.scheduledAt.getTime())) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'scheduledAt is not a valid date.', 400);
  }

  const { db } = dbFromRequest();
  return db.transaction(async (tx) => {
    const existing = await loadInterviewForCompany(tx, input.interviewId, input.companyId);
    if (existing.interview.status !== 'scheduled') {
      throw new AppError(
        AppErrorCode.CONFLICT,
        'Only a scheduled interview can be rescheduled.',
        409
      );
    }

    const [row] = await tx
      .update(interviews)
      .set({
        scheduledAt: input.scheduledAt,
        durationMinutes: Math.min(
          Math.max(input.durationMinutes ?? existing.interview.durationMinutes, 5),
          480
        ),
        mode: input.mode ?? existing.interview.mode,
        locationOrLink:
          input.locationOrLink === undefined
            ? existing.interview.locationOrLink
            : input.locationOrLink?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, input.interviewId))
      .returning();

    await recordHistoryWith(tx, {
      interviewId: input.interviewId,
      eventType: 'rescheduled',
      scheduledAt: input.scheduledAt,
      note: input.note ?? null,
      actorUserId: input.actorUserId,
    });

    return row;
  });
}

/** Terminal decisions on a live interview: completed, cancelled or no-show. */
export async function updateInterviewStatus(input: {
  companyId: string;
  interviewId: string;
  actorUserId: string;
  status: Extract<InterviewStatus, 'completed' | 'cancelled' | 'no_show'>;
  notes?: string | null;
}): Promise<InterviewRow> {
  await requirePlanFeature(input.companyId, 'interview_management');

  const { db } = dbFromRequest();
  return db.transaction(async (tx) => {
    const existing = await loadInterviewForCompany(tx, input.interviewId, input.companyId);
    if (existing.interview.status !== 'scheduled') {
      throw new AppError(AppErrorCode.CONFLICT, 'This interview has already been decided.', 409);
    }

    const [row] = await tx
      .update(interviews)
      .set({
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, input.interviewId))
      .returning();

    await recordHistoryWith(tx, {
      interviewId: input.interviewId,
      eventType: input.status,
      scheduledAt: existing.interview.scheduledAt,
      note: null,
      actorUserId: input.actorUserId,
    });

    return row;
  });
}

const joinedSelect = {
  interview: interviews,
  jobTitle: jobs.title,
  candidateName: candidateProfiles.fullName,
};

/** Upcoming-first interview list for a company (employer view, WITH notes). */
export async function listInterviewsForCompany(
  companyId: string,
  options: { status?: string; limit?: number } = {}
): Promise<InterviewDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows: JoinedRow[] = await db
    .select(joinedSelect)
    .from(interviews)
    .innerJoin(jobs, eq(interviews.jobId, jobs.id))
    .innerJoin(candidateProfiles, eq(interviews.candidateId, candidateProfiles.id))
    .where(
      options.status
        ? and(eq(interviews.companyId, companyId), eq(interviews.status, options.status))
        : eq(interviews.companyId, companyId)
    )
    .orderBy(asc(interviews.scheduledAt))
    .limit(limit);
  return rows.map(toEmployerDTO);
}

/** Interviews for one application (employer detail view, WITH notes). */
export async function listInterviewsForApplication(
  applicationId: string,
  companyId: string
): Promise<InterviewDTO[]> {
  const { db } = dbFromRequest();
  const rows: JoinedRow[] = await db
    .select(joinedSelect)
    .from(interviews)
    .innerJoin(jobs, eq(interviews.jobId, jobs.id))
    .innerJoin(candidateProfiles, eq(interviews.candidateId, candidateProfiles.id))
    .where(and(eq(interviews.applicationId, applicationId), eq(interviews.companyId, companyId)))
    .orderBy(asc(interviews.scheduledAt));
  return rows.map(toEmployerDTO);
}

/** The candidate's own interview schedule (WITHOUT notes). */
export async function listInterviewsForCandidate(
  candidateId: string,
  options: { limit?: number } = {}
): Promise<Array<Omit<InterviewDTO, 'notes'>>> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows: JoinedRow[] = await db
    .select(joinedSelect)
    .from(interviews)
    .innerJoin(jobs, eq(interviews.jobId, jobs.id))
    .innerJoin(candidateProfiles, eq(interviews.candidateId, candidateProfiles.id))
    .where(eq(interviews.candidateId, candidateId))
    .orderBy(desc(interviews.scheduledAt))
    .limit(limit);
  return rows.map(toCandidateDTO);
}

/**
 * Full history for one interview, newest first (employer view).
 *
 * Scoped through the interview first: history must not leak across tenants,
 * whatever id a caller supplies.
 */
export async function listInterviewHistory(
  interviewId: string,
  companyId: string
): Promise<
  Array<{ id: string; eventType: string; scheduledAt: string | null; note: string | null; createdAt: string }>
> {
  const { db } = dbFromRequest();
  await loadInterviewForCompany(db, interviewId, companyId);
  const rows = await db
    .select({
      id: interviewHistory.id,
      eventType: interviewHistory.eventType,
      scheduledAt: interviewHistory.scheduledAt,
      note: interviewHistory.note,
      createdAt: interviewHistory.createdAt,
    })
    .from(interviewHistory)
    .where(eq(interviewHistory.interviewId, interviewId))
    .orderBy(desc(interviewHistory.createdAt));
  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}

