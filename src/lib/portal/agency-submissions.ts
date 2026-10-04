import 'server-only';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  AGENCY_SUBMISSION_STATUSES,
  agencySubmissionEvents,
  agencySubmissions,
  candidateProfiles,
  companies,
  jobApplications,
  jobs,
  userConsents,
  type AgencySubmissionRow,
  type AgencySubmissionStatus,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { requireAgencyClientAccess } from '@/lib/portal/agencies';

/**
 * Agency submissions (see §15 of the brief): an agency putting a candidate
 * forward to a client company for a specific job.
 *
 * The rules this module exists to guarantee:
 *
 *  1. THE AGENCY→CLIENT LINK IS RE-AUTHORISED ON EVERY SUBMISSION through
 *     `requireAgencyClientAccess`, so a revoked relationship stops submissions
 *     immediately; nothing is remembered from when the link was created.
 *  2. CONSENT IS RESOLVED SERVER-SIDE, never supplied by the caller. The
 *     `user_consents` row id is written to a NOT NULL foreign key, so a
 *     submission without a live, purpose-matched consent cannot exist even if
 *     every other check were bypassed.
 *  3. ONE SUBMISSION PER (JOB, CANDIDATE) — enforced by the unique index, so a
 *     double-click or a retried request cannot spam a client with duplicates.
 *  4. STATUS MOVES ARE SIDE-SCOPED AND APPEND-ONLY. The agency may withdraw;
 *     the client owns the review decisions; every move lands in
 *     `agency_submission_events`.
 */

/** Who may move a submission to each next status. */
const CLIENT_TRANSITIONS: Record<string, readonly AgencySubmissionStatus[]> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['client_interview', 'rejected'],
  client_interview: ['client_selected', 'rejected'],
};

const AGENCY_TRANSITIONS: Record<string, readonly AgencySubmissionStatus[]> = {
  submitted: ['withdrawn'],
  under_review: ['withdrawn'],
};

export function isAgencySubmissionStatus(value: string): value is AgencySubmissionStatus {
  return (AGENCY_SUBMISSION_STATUSES as readonly string[]).includes(value);
}

export interface AgencySubmissionDTO {
  id: string;
  status: AgencySubmissionStatus;
  agencyCompanyId: string;
  agencyName: string;
  clientCompanyId: string;
  clientName: string;
  jobId: string;
  jobTitle: string;
  candidateId: string;
  candidateName: string;
  applicationId: string | null;
  notes: string | null;
  submittedAt: string;
  updatedAt: string;
  /** True when the caller's company is the submitting agency. */
  asAgency: boolean;
}

/** The consent row that authorises sharing this candidate with a client. */
async function resolveConsentForCandidate(
  candidateUserId: string
): Promise<{ id: string; purpose: string } | null> {
  const { db } = dbFromRequest();
  // Purpose-matched: an agency submission is a sharing/processing act, so only
  // those purposes count. `employer_sharing` is the exact fit and is preferred.
  const rows = await db
    .select({ id: userConsents.id, purpose: userConsents.purpose })
    .from(userConsents)
    .where(
      and(
        eq(userConsents.userId, candidateUserId),
        or(eq(userConsents.purpose, 'employer_sharing'), eq(userConsents.purpose, 'recruitment_services')),
        // Withdrawn consent is not consent, however long ago it was granted.
        isNull(userConsents.withdrawnAt)
      )
    )
    .orderBy(desc(userConsents.acceptedAt));
  if (rows.length === 0) return null;
  return rows.find((row) => row.purpose === 'employer_sharing') ?? rows[0];
}

/**
 * Submits a candidate to a client's job.
 *
 * Derives everything the client would otherwise have to trust: the client
 * company comes from the job, the agency's authority is re-checked now, the
 * candidate's consent row is looked up from their own account, and any
 * existing application is linked. The unique index makes a repeat submission
 * return the ORIGINAL row instead of creating a second one.
 */
export async function submitCandidate(input: {
  agencyCompanyId: string;
  actorUserId: string;
  jobId: string;
  candidateId: string;
  notes?: string | null;
  now?: Date;
}): Promise<{ submission: AgencySubmissionRow; created: boolean }> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .limit(1);
  if (!job) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);
  }

  // The client is whoever the vacancy is FOR: a client's own job, or a job the
  // agency posted on the client's behalf.
  const clientCompanyId =
    job.companyId === input.agencyCompanyId ? job.postedForCompanyId : job.companyId;
  if (!clientCompanyId) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'This job is not published for a client company, so there is nobody to submit to.',
      400
    );
  }

  // Re-authorise the relationship RIGHT NOW: a revoked link stops submissions
  // immediately, whatever was true when the relationship was created.
  await requireAgencyClientAccess({
    agencyCompanyId: input.agencyCompanyId,
    clientCompanyId,
  });

  const [candidate] = await db
    .select({
      id: candidateProfiles.id,
      userId: candidateProfiles.userId,
      fullName: candidateProfiles.fullName,
    })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.id, input.candidateId))
    .limit(1);
  if (!candidate) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested candidate was not found.', 404);
  }

  // Consent is resolved from the CANDIDATE's own account — never accepted from
  // the request body, which could name any consent row it likes.
  const consent = await resolveConsentForCandidate(candidate.userId);
  if (!consent) {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This candidate has not consented to being shared with employers, so they cannot be submitted.',
      403
    );
  }

  const [application] = await db
    .select({ id: jobApplications.id })
    .from(jobApplications)
    .where(and(eq(jobApplications.jobId, input.jobId), eq(jobApplications.candidateId, candidate.id)))
    .limit(1);

  const inserted = await db
    .insert(agencySubmissions)
    .values({
      agencyCompanyId: input.agencyCompanyId,
      clientCompanyId,
      jobId: input.jobId,
      candidateId: candidate.id,
      applicationId: application?.id ?? null,
      consentId: consent.id,
      submittedByUserId: input.actorUserId,
      status: 'submitted',
      notes: input.notes?.trim() || null,
      submittedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    await db.insert(agencySubmissionEvents).values({
      submissionId: inserted[0].id,
      fromStatus: null,
      toStatus: 'submitted',
      note: null,
      actorUserId: input.actorUserId,
      createdAt: now,
    });
    return { submission: inserted[0], created: true };
  }

  // Already submitted: the unique index did its job. Return the original so a
  // retried request converges instead of failing.
  const [existing] = await db
    .select()
    .from(agencySubmissions)
    .where(and(eq(agencySubmissions.jobId, input.jobId), eq(agencySubmissions.candidateId, candidate.id)))
    .limit(1);
  if (!existing) {
    throw new AppError(AppErrorCode.CONFLICT, 'The submission could not be created.', 409);
  }
  return { submission: existing, created: false };
}

/**
 * Moves a submission to its next status.
 *
 * The caller's company decides WHICH map applies: the agency may only withdraw,
 * the client owns every review decision. Attempting a transition outside that
 * split — or from a terminal state — is a 409, and the guarded UPDATE means a
 * concurrent decision by the other side still loses cleanly.
 */
export async function updateSubmissionStatus(input: {
  submissionId: string;
  actorCompanyId: string;
  actorUserId: string;
  status: AgencySubmissionStatus;
  note?: string | null;
  now?: Date;
}): Promise<AgencySubmissionRow> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [existing] = await db
    .select()
    .from(agencySubmissions)
    .where(eq(agencySubmissions.id, input.submissionId))
    .limit(1);
  if (!existing) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested submission was not found.', 404);
  }

  const asAgency = existing.agencyCompanyId === input.actorCompanyId;
  const asClient = existing.clientCompanyId === input.actorCompanyId;
  if (!asAgency && !asClient) {
    // Not a party to this submission: the same 404 as a non-existent id, so a
    // foreign uuid cannot be probed.
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested submission was not found.', 404);
  }

  const allowed = asAgency
    ? AGENCY_TRANSITIONS[existing.status] ?? []
    : CLIENT_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw new AppError(
      AppErrorCode.CONFLICT,
      `A submission that is '${existing.status}' cannot move to '${input.status}'.`,
      409
    );
  }

  const [updated] = await db
    .update(agencySubmissions)
    .set({ status: input.status, updatedAt: now })
    .where(and(eq(agencySubmissions.id, existing.id), eq(agencySubmissions.status, existing.status)))
    .returning();
  if (!updated) {
    throw new AppError(
      AppErrorCode.CONFLICT,
      'The submission changed while you were working on it. Please reload and try again.',
      409
    );
  }

  await db.insert(agencySubmissionEvents).values({
    submissionId: existing.id,
    fromStatus: existing.status,
    toStatus: input.status,
    note: input.note?.trim() || null,
    actorUserId: input.actorUserId,
    createdAt: now,
  });

  return updated;
}

const joinedSelect = {
  submission: agencySubmissions,
  agencyName: companies.name,
  jobTitle: jobs.title,
  candidateName: candidateProfiles.fullName,
};

function toDTO(
  row: {
    submission: AgencySubmissionRow;
    agencyName: string;
    jobTitle: string;
    candidateName: string;
  },
  clientName: string,
  actorCompanyId: string
): AgencySubmissionDTO {
  return {
    id: row.submission.id,
    status: row.submission.status as AgencySubmissionStatus,
    agencyCompanyId: row.submission.agencyCompanyId,
    agencyName: row.agencyName,
    clientCompanyId: row.submission.clientCompanyId,
    clientName,
    jobId: row.submission.jobId,
    jobTitle: row.jobTitle,
    candidateId: row.submission.candidateId,
    candidateName: row.candidateName,
    applicationId: row.submission.applicationId,
    notes: row.submission.notes,
    submittedAt: row.submission.submittedAt.toISOString(),
    updatedAt: row.submission.updatedAt.toISOString(),
    asAgency: row.submission.agencyCompanyId === actorCompanyId,
  };
}

/**
 * Submissions visible to a company — as the submitting agency, as the client
 * receiving them, or both. The `asAgency` flag tells the UI which side of the
 * relationship it is looking from.
 */
export async function listSubmissionsForCompany(
  actorCompanyId: string,
  options: { status?: string; limit?: number } = {}
): Promise<AgencySubmissionDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const party = or(
    eq(agencySubmissions.agencyCompanyId, actorCompanyId),
    eq(agencySubmissions.clientCompanyId, actorCompanyId)
  );
  const where = options.status ? and(party, eq(agencySubmissions.status, options.status)) : party;

  const rows = await db
    .select(joinedSelect)
    .from(agencySubmissions)
    .innerJoin(companies, eq(agencySubmissions.agencyCompanyId, companies.id))
    .innerJoin(jobs, eq(agencySubmissions.jobId, jobs.id))
    .innerJoin(candidateProfiles, eq(agencySubmissions.candidateId, candidateProfiles.id))
    .where(where)
    .orderBy(desc(agencySubmissions.submittedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const clientIds = [...new Set(rows.map((row) => row.submission.clientCompanyId))];
  const clients = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(
      clientIds.length === 1
        ? eq(companies.id, clientIds[0])
        : or(...clientIds.map((id) => eq(companies.id, id)))
    );
  const namesById = new Map(clients.map((row) => [row.id, row.name]));

  return rows.map((row) =>
    toDTO(row, namesById.get(row.submission.clientCompanyId) ?? '', actorCompanyId)
  );
}

/** Append-only history for one submission, scoped to the two parties. */
export async function listSubmissionEvents(
  submissionId: string,
  actorCompanyId: string
): Promise<
  Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>
> {
  const { db } = dbFromRequest();
  const [submission] = await db
    .select({
      agencyCompanyId: agencySubmissions.agencyCompanyId,
      clientCompanyId: agencySubmissions.clientCompanyId,
    })
    .from(agencySubmissions)
    .where(eq(agencySubmissions.id, submissionId))
    .limit(1);
  if (
    !submission ||
    (submission.agencyCompanyId !== actorCompanyId && submission.clientCompanyId !== actorCompanyId)
  ) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested submission was not found.', 404);
  }

  const rows = await db
    .select({
      id: agencySubmissionEvents.id,
      fromStatus: agencySubmissionEvents.fromStatus,
      toStatus: agencySubmissionEvents.toStatus,
      note: agencySubmissionEvents.note,
      createdAt: agencySubmissionEvents.createdAt,
    })
    .from(agencySubmissionEvents)
    .where(eq(agencySubmissionEvents.submissionId, submissionId))
    .orderBy(desc(agencySubmissionEvents.createdAt));

  return rows.map((row) => ({
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}
