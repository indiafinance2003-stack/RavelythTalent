import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { config } from '@/lib/config';
import { dbFromRequest } from '@/lib/db/request';
import {
  companies,
  jobStatusHistory,
  jobs,
  type JobRow,
  type JobStatus,
  type NewJobRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import {
  consumeJobPostWith,
  releaseJobPostForJob,
} from '@/lib/portal/recruiter-plans/service';
import { requireAgencyClientAccess } from '@/lib/portal/agencies';
import { notifyJobDecision } from '@/lib/portal/candidate-notifications';
import {
  assertTransition,
  changedMaterialFields,
  type TransitionActor,
} from './lifecycle';

/**
 * Employer/admin job posting service.
 *
 * The approval workflow is the security-critical part (see §8):
 *  - when `JOB_APPROVAL_REQUIRED` is on (the default), an employer submitting a
 *    job lands in 'pending_approval' and CANNOT publish it; only an admin can;
 *  - the transition table in `lifecycle.ts` is the single source of truth, so a
 *    route handler cannot invent a looser rule;
 *  - a job credit is consumed at submission time (when credits are required),
 *    inside the same transaction as the status change, and is returned if the
 *    employer withdraws before approval.
 */

export interface JobInput {
  title: string;
  description: string;
  companyId: string;
  createdByUserId: string;
  department?: string | null;
  employmentType?: string;
  experienceMinYears?: number | null;
  experienceMaxYears?: number | null;
  location?: string | null;
  workMode?: string;
  salaryMinMinor?: number | null;
  salaryMaxMinor?: number | null;
  salaryPublic?: boolean;
  openings?: number;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  educationRequirements?: string | null;
  skills?: string[];
  applicationDeadline?: Date | null;
  /**
   * Client company, ONLY when a recruitment agency posts on its behalf.
   *
   * Left null for a direct employer. When present, the service verifies the
   * agency is a recruitment agency with an ACTIVE client link; an unauthorised
   * agency is refused rather than silently posting as itself.
   */
  postedForCompanyId?: string | null;
}

/** Normalises a skill list to the lowercase form stored and searched. */
function normalizeSkills(skills: string[] | undefined): string[] {
  if (!Array.isArray(skills)) return [];
  const unique = new Set<string>();
  for (const skill of skills) {
    if (typeof skill !== 'string') continue;
    const normalized = skill.trim().toLowerCase();
    if (normalized.length > 0 && normalized.length <= 60) unique.add(normalized);
    if (unique.size >= 50) break;
  }
  return [...unique];
}

function cleanList(values: string[] | undefined, max = 30): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, max);
}

/**
 * Creates a job in DRAFT. No credit is consumed yet: an employer may save work
 * without buying anything.
 */
export async function createJob(input: JobInput): Promise<JobRow> {
  const { db } = dbFromRequest();

  const [company] = await db
    .select({ id: companies.id, status: companies.status })
    .from(companies)
    .where(eq(companies.id, input.companyId))
    .limit(1);
  if (!company) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);
  }
  if (company.status !== 'active') {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This company account is suspended and cannot post jobs.',
      403
    );
  }

  // Agency posting: resolve and AUTHORISE the client before anything is written.
  // An unauthorised agency must fail loudly rather than quietly posting a
  // vacancy that claims to be its client's.
  const clientForPosting = input.postedForCompanyId
    ? await requireAgencyClientAccess({
        agencyCompanyId: input.companyId,
        clientCompanyId: input.postedForCompanyId,
      })
    : null;

  const [row] = await db
    .insert(jobs)
    .values({
      title: input.title.trim(),
      description: input.description.trim(),
      companyId: input.companyId,
      createdByUserId: input.createdByUserId,
      department: input.department?.trim() ?? null,
      employmentType: input.employmentType ?? 'full_time',
      experienceMinYears: input.experienceMinYears ?? null,
      experienceMaxYears: input.experienceMaxYears ?? null,
      location: input.location?.trim() ?? null,
      workMode: input.workMode ?? 'onsite',
      salaryMinMinor: input.salaryMinMinor ?? null,
      salaryMaxMinor: input.salaryMaxMinor ?? null,
      salaryPublic: input.salaryPublic ?? false,
      openings: Math.max(1, input.openings ?? 1),
      responsibilities: cleanList(input.responsibilities),
      requirements: cleanList(input.requirements),
      benefits: cleanList(input.benefits),
      educationRequirements: input.educationRequirements?.trim() ?? null,
      skills: normalizeSkills(input.skills),
      applicationDeadline: input.applicationDeadline ?? null,
      // Provenance of the vacancy. Billing and tenant scoping still belong to
      // companies.companyId (the agency); this records whose vacancy it is.
      postedForCompanyId: clientForPosting?.id ?? null,
      status: 'draft',
    } satisfies NewJobRow)
    .returning();

  await recordPortalAudit({
    action: 'job_created',
    actorUserId: input.createdByUserId,
    description: `Job draft created: ${row.title}`,
    metadata: {
      jobId: row.id,
      companyId: input.companyId,
      // Recorded so an auditor can see a vacancy was published FOR another company.
      postedForCompanyId: clientForPosting?.id ?? null,
    },
  });

  return row;
}

/**
 * Submits a job for approval.
 *
 * When approval is required this lands in 'pending_approval'; an employer can
 * never jump straight to 'published'. A job credit is consumed here (when
 * credits are required) so the employer cannot submit unlimited postings.
 *
 * The credit consumption and the status change run in ONE transaction: if the
 * status update fails the credit is rolled back, so an employer is never charged
 * for a posting that did not actually go anywhere.
 */
export async function submitJobForApproval(input: {
  jobId: string;
  companyId: string;
  actorUserId: string;
  now?: Date;
}): Promise<JobRow> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const nextStatus: JobStatus = config.JOB_APPROVAL_REQUIRED
    ? 'pending_approval'
    : 'published';

  const updated = await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.companyId, input.companyId)))
      .limit(1);
    if (!job) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);

    assertTransition(job.status, 'pending_approval', 'employer');

    if (config.JOB_CREDIT_REQUIRED) {
      // Plan allowance first, prepaid credits as the overflow — and it joins
      // THIS transaction, so a later failure returns whatever was spent.
      await consumeJobPostWith(tx, {
        companyId: input.companyId,
        jobId: input.jobId,
        actorUserId: input.actorUserId,
      });
    }

    const expiresAt = new Date(
      now.getTime() + Math.max(1, config.JOB_DEFAULT_VALIDITY_DAYS) * 24 * 60 * 60 * 1000
    );

    const [row] = await tx
      .update(jobs)
      .set({
        status: nextStatus,
        updatedAt: now,
        ...(nextStatus === 'published' ? { publishedAt: now, expiresAt } : {}),
      })
      .where(and(eq(jobs.id, input.jobId), eq(jobs.status, job.status)))
      .returning();

    if (!row) {
      throw new AppError(
        AppErrorCode.CONFLICT,
        'The job changed while you were working on it. Please reload and try again.',
        409
      );
    }

    await tx.insert(jobStatusHistory).values({
      jobId: input.jobId,
      fromStatus: job.status,
      toStatus: nextStatus,
      changedByUserId: input.actorUserId,
      reason: 'Submitted by employer',
      createdAt: now,
    });

    return row;
  });

  // Audit runs AFTER commit: writing it inside the transaction would roll the
  // audit record back along with the business change it describes.
  await recordPortalAudit({
    action: 'job_submitted_for_approval',
    actorUserId: input.actorUserId,
    description: `Job submitted for approval: ${updated.title}`,
    metadata: { jobId: input.jobId, companyId: input.companyId, status: nextStatus },
  });

  return updated;
}

/**
 * Admin decision on a pending job.
 *
 * Only an admin may reach this function's callers, and the transition is still
 * validated against the admin table, so an approval can never be bypassed by
 * passing a different `from` state.
 */
export async function reviewJob(input: {
  jobId: string;
  decision: 'approve' | 'reject';
  adminUserId: string;
  reason?: string | null;
  now?: Date;
}): Promise<JobRow> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  if (!job) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);

  const nextStatus: JobStatus = input.decision === 'approve' ? 'published' : 'rejected';

  // A rejection must carry a reason the employer can act on.
  if (input.decision === 'reject' && (!input.reason || input.reason.trim().length === 0)) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'A reason is required when rejecting a job posting.',
      400
    );
  }

  assertTransition(job.status, nextStatus, 'admin');

  const expiresAt = new Date(
    now.getTime() + Math.max(1, config.JOB_DEFAULT_VALIDITY_DAYS) * 24 * 60 * 60 * 1000
  );

  const [updated] = await db
    .update(jobs)
    .set({
      status: nextStatus,
      updatedAt: now,
      ...(input.decision === 'approve'
        ? { publishedAt: now, expiresAt, rejectionReason: null }
        : { rejectionReason: input.reason!.trim().slice(0, 1000) }),
    })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.status, job.status)))
    .returning();

  if (!updated) {
    throw new AppError(
      AppErrorCode.CONFLICT,
      'The job changed while you were reviewing it. Please reload and try again.',
      409
    );
  }

  await db.insert(jobStatusHistory).values({
    jobId: input.jobId,
    fromStatus: job.status,
    toStatus: nextStatus,
    changedByUserId: input.adminUserId,
    reason: input.reason?.trim() ?? null,
    createdAt: now,
  });

  await recordPortalAudit({
    action: input.decision === 'approve' ? 'job_approved' : 'job_rejected',
    actorUserId: input.adminUserId,
    description: `Job ${input.decision === 'approve' ? 'approved' : 'rejected'}: ${updated.title}`,
    metadata: { jobId: input.jobId, from: job.status, to: nextStatus },
  });

  // The employer hears about the decision. This runs AFTER the commit and
  // swallows its own failures, so a mail outage can neither roll back nor
  // block a moderation decision that has already taken effect.
  await notifyJobDecision({
    jobId: input.jobId,
    approved: input.decision === 'approve',
    rejectionReason: input.reason ?? null,
  });

  return updated;
}

/**
 * Applies a status change for either actor, validated against the transition
 * table. Employer reads of the job are scoped by the caller's own companyId, so
 * a guessed job id never reaches another tenant's posting.
 */
export async function changeJobStatus(input: {
  jobId: string;
  nextStatus: JobStatus;
  actorUserId: string;
  actor: TransitionActor;
  /** Required for an employer; ignored for an admin. */
  companyId?: string;
  reason?: string | null;
  now?: Date;
}): Promise<JobRow> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const filters = [eq(jobs.id, input.jobId)];
  if (input.actor === 'employer') filters.push(eq(jobs.companyId, input.companyId ?? ''));

  const [job] = await db.select().from(jobs).where(and(...filters)).limit(1);
  if (!job) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);

  assertTransition(job.status, input.nextStatus, input.actor);

  const [updated] = await db
    .update(jobs)
    .set({ status: input.nextStatus, updatedAt: now })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.status, job.status)))
    .returning();

  if (!updated) {
    throw new AppError(AppErrorCode.CONFLICT, 'The job changed. Please reload and try again.', 409);
  }

  await db.insert(jobStatusHistory).values({
    jobId: input.jobId,
    fromStatus: job.status,
    toStatus: input.nextStatus,
    changedByUserId: input.actorUserId,
    reason: input.reason?.trim() ?? null,
    createdAt: now,
  });

  await recordPortalAudit({
    action:
      input.nextStatus === 'closed'
        ? 'job_closed'
        : input.nextStatus === 'expired'
          ? 'job_expired'
          : 'job_resubmitted',
    actorUserId: input.actorUserId,
    description: `Job status changed from ${job.status} to ${input.nextStatus}`,
    metadata: { jobId: input.jobId, from: job.status, to: input.nextStatus },
  });

  return updated;
}

/**
 * Withdraws a pending or rejected job back to draft, returning the consumed
 * credit when one was taken. Only the owning employer can do this.
 */
export async function withdrawJob(input: {
  jobId: string;
  companyId: string;
  actorUserId: string;
  now?: Date;
}): Promise<JobRow> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, input.jobId), eq(jobs.companyId, input.companyId)))
    .limit(1);
  if (!job) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);

  assertTransition(job.status, 'draft', 'employer');

  const [updated] = await db
    .update(jobs)
    .set({ status: 'draft', rejectionReason: null, updatedAt: now })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.status, job.status)))
    .returning();

  if (!updated) {
    throw new AppError(AppErrorCode.CONFLICT, 'The job changed. Please reload and try again.', 409);
  }

  // Return whatever the submission consumed: a plan post (allowance returned to
  // the period) or a prepaid credit (ledger refund). Both are safe no-ops when
  // nothing was taken.
  await releaseJobPostForJob({
    companyId: input.companyId,
    jobId: input.jobId,
    actorUserId: input.actorUserId,
    reason: 'job withdrawn before approval',
  });

  await db.insert(jobStatusHistory).values({
    jobId: input.jobId,
    fromStatus: job.status,
    toStatus: 'draft',
    changedByUserId: input.actorUserId,
    reason: 'Withdrawn by employer',
    createdAt: now,
  });

  return updated;
}


/** One job for its owning company. */
export async function getCompanyJob(jobId: string, companyId: string): Promise<JobRow> {
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
    .limit(1);
  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);
  return row;
}

/** Any job by id. Callers MUST have already passed the admin guard. */
export async function getJobForAdmin(jobId: string): Promise<JobRow> {
  const { db } = dbFromRequest();
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);
  return row;
}

/** Jobs for one company, newest first. */
export async function listCompanyJobs(
  companyId: string,
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<JobRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const filters = [eq(jobs.companyId, companyId)];
  if (options.status) filters.push(eq(jobs.status, options.status));

  return db
    .select()
    .from(jobs)
    .where(and(...filters))
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0));
}

/** Platform job listing for the admin review queue. */
export async function listJobsForAdmin(
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<JobRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  return db
    .select()
    .from(jobs)
    .where(options.status ? eq(jobs.status, options.status) : undefined)
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0));
}

/** Full status history for a job. */
export async function getJobHistory(jobId: string): Promise<
  Array<{
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    createdAt: string;
  }>
> {
  const { db } = dbFromRequest();
  const rows = await db
    .select()
    .from(jobStatusHistory)
    .where(eq(jobStatusHistory.jobId, jobId))
    .orderBy(jobStatusHistory.createdAt);

  return rows.map((row) => ({
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Updates a job. A MATERIAL change to a live posting sends it back through
 * approval, so an employer cannot publish an approved role and then swap in
 * different content.
 *
 * Returns the updated job plus whether reapproval is now required.
 */
export async function updateJob(input: {
  jobId: string;
  companyId: string;
  actorUserId: string;
  changes: Partial<JobInput>;
  now?: Date;
}): Promise<{ job: JobRow; requiresReapproval: boolean }> {
  const now = input.now ?? new Date();
  const { db } = dbFromRequest();

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, input.jobId), eq(jobs.companyId, input.companyId)))
    .limit(1);
  if (!job) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested job was not found.', 404);

  const before = job as unknown as Record<string, unknown>;
  const after: Record<string, unknown> = { ...before };

  const patch: Partial<NewJobRow> = { updatedAt: now };
  const scalarKeys: Array<keyof JobInput> = [
    'title',
    'description',
    'department',
    'employmentType',
    'experienceMinYears',
    'experienceMaxYears',
    'location',
    'workMode',
    'salaryMinMinor',
    'salaryMaxMinor',
    'salaryPublic',
    'openings',
    'educationRequirements',
  ];
  for (const key of scalarKeys) {
    const value = input.changes[key];
    if (value !== undefined) {
      (patch as Record<string, unknown>)[key] = value;
      after[key] = value;
    }
  }
  if (input.changes.skills !== undefined) {
    const skills = normalizeSkills(input.changes.skills);
    patch.skills = skills;
    after.skills = skills;
  }
  for (const key of ['responsibilities', 'requirements', 'benefits'] as const) {
    const value = input.changes[key];
    if (value !== undefined) {
      const list = cleanList(value);
      (patch as Record<string, unknown>)[key] = list;
      after[key] = list;
    }
  }
  if (input.changes.applicationDeadline !== undefined) {
    patch.applicationDeadline = input.changes.applicationDeadline;
    after.applicationDeadline = input.changes.applicationDeadline;
  }

  const material = changedMaterialFields(before, after);

  // A live job whose material content changed must be reviewed again.
  const requiresReapproval =
    config.JOB_APPROVAL_REQUIRED && job.status === 'published' && material.length > 0;

  const [updated] = await db
    .update(jobs)
    .set({
      ...patch,
      ...(requiresReapproval ? { status: 'pending_approval', publishedAt: null } : {}),
    })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.status, job.status)))
    .returning();

  if (!updated) {
    throw new AppError(AppErrorCode.CONFLICT, 'The job changed. Please reload and try again.', 409);
  }

  if (requiresReapproval) {
    await db.insert(jobStatusHistory).values({
      jobId: input.jobId,
      fromStatus: 'published',
      toStatus: 'pending_approval',
      changedByUserId: input.actorUserId,
      reason: `Material change: ${material.join(', ')}`,
      createdAt: now,
    });
    await recordPortalAudit({
      action: 'job_resubmitted',
      actorUserId: input.actorUserId,
      description: 'Published job returned for re-approval after a material edit',
      metadata: { jobId: input.jobId, changedFields: material },
    });
  }

  return { job: updated, requiresReapproval };
}

export { changedMaterialFields };
