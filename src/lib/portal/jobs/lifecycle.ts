import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import type { JobStatus } from '@/lib/db/portal-schema';
import { isJobStatus } from '../constants';

/**
 * Job posting lifecycle rules (see §8 of the brief).
 *
 * These transitions are enforced in ONE place and called by the job service.
 * The rules are deliberately asymmetric:
 *
 *  - An EMPLOYER may only submit for approval and withdraw to draft. It can
 *    never reach 'published' directly when approval is required, which is the
 *    rule the brief calls out explicitly.
 *  - An ADMIN may approve or reject a pending job, and may also suspend or
 *    close any job.
 *
 * Keeping this pure makes the workflow directly unit testable and guarantees a
 * route handler cannot invent its own, looser, transition rules.
 */

/** Transitions an employer is allowed to perform on their own company jobs. */
export const EMPLOYER_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['pending_approval'],
  pending_approval: ['draft'],
  published: ['closed'],
  closed: [],
  expired: [],
  rejected: ['draft', 'pending_approval'],
};

/** Transitions an administrator may perform. */
export const ADMIN_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['pending_approval'],
  pending_approval: ['published', 'rejected'],
  published: ['closed', 'expired'],
  closed: [],
  expired: [],
  rejected: ['pending_approval'],
};

export type TransitionActor = 'employer' | 'admin';

/**
 * Whether `to` is a legal transition from `from` for this actor.
 * Unknown statuses are always rejected.
 */
export function canTransition(from: string, to: string, actor: TransitionActor): boolean {
  if (!isJobStatus(from) || !isJobStatus(to)) return false;
  const table: Record<JobStatus, readonly JobStatus[]> =
    actor === 'admin' ? ADMIN_TRANSITIONS : EMPLOYER_TRANSITIONS;
  return table[from].includes(to);
}

/** Throws a 409 when the transition is not permitted. */
export function assertTransition(
  from: string,
  to: string,
  actor: TransitionActor
): void {
  if (canTransition(from, to, actor)) return;

  if (actor === 'employer' && to === 'published') {
    // A dedicated, actionable error: the employer is told exactly what to do.
    throw new AppError(
      AppErrorCode.APPROVAL_REQUIRED,
      'Every job posting must be reviewed by our team before it goes live. Submit it for approval instead.',
      409
    );
  }

  throw new AppError(
    AppErrorCode.CONFLICT,
    `A job cannot move from "${from}" to "${to}".`,
    409
  );
}

/** Whether a job in this status is accepting applications. */
export function isAcceptingApplications(job: {
  status: string;
  applicationDeadline: Date | null;
  expiresAt: Date | null;
}, now: Date = new Date()): boolean {
  if (job.status !== 'published') return false;
  if (job.applicationDeadline && job.applicationDeadline.getTime() < now.getTime()) return false;
  if (job.expiresAt && job.expiresAt.getTime() < now.getTime()) return false;
  return true;
}

/**
 * Explains why a job is not accepting applications, for a precise API error.
 * Returns null when it is accepting.
 */
export function applicationRejectionReason(
  job: { status: string; applicationDeadline: Date | null; expiresAt: Date | null },
  now: Date = new Date()
): string | null {
  if (job.status === 'closed') return 'This job is no longer accepting applications.';
  if (job.status === 'draft' || job.status === 'pending_approval') {
    return 'This job is not open for applications.';
  }
  if (job.status === 'rejected') return 'This job posting was not approved.';
  if (job.status === 'expired') return 'This job posting has expired.';
  if (job.status !== 'published') return 'This job is not open for applications.';
  if (job.applicationDeadline && job.applicationDeadline.getTime() < now.getTime()) {
    return 'The application deadline for this job has passed.';
  }
  if (job.expiresAt && job.expiresAt.getTime() < now.getTime()) {
    return 'This job posting has expired.';
  }
  return null;
}

/**
 * Fields whose change forces a published job back through approval.
 *
 * Material changes must not silently stay live, otherwise an employer could
 * publish an approved role and then swap in different content.
 */
export const MATERIAL_JOB_FIELDS = [
  'title',
  'description',
  'responsibilities',
  'requirements',
  'benefits',
  'educationRequirements',
  'salaryMinMinor',
  'salaryMaxMinor',
  'salaryPublic',
  'skills',
  'employmentType',
  'workMode',
  'location',
  'experienceMinYears',
  'experienceMaxYears',
  'openings',
  'applicationDeadline',
] as const;

export type MaterialJobField = (typeof MATERIAL_JOB_FIELDS)[number];

/** Returns the material fields that differ between two job versions. */
export function changedMaterialFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): MaterialJobField[] {
  const changed: MaterialJobField[] = [];
  for (const field of MATERIAL_JOB_FIELDS) {
    const a = normalizeComparable(before[field]);
    const b = normalizeComparable(after[field]);
    if (a !== b) changed.push(field);
  }
  return changed;
}

/** Normalises a value so undefined, null and empty array compare equal. */
function normalizeComparable(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    return [...value].map((item) => String(item).trim().toLowerCase()).sort().join(',');
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.trim().toLowerCase();
  return String(value);
}
