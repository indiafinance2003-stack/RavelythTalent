import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { config } from '@/lib/config';
import { dbFromRequest } from '@/lib/db/request';
import {
  jobApplications,
  jobs,
  resumeAccessLogs,
  resumes,
  resumeTemplates,
  resumeVersions,
  type ResumeRow,
  type ResumeVersionRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { deleteFile, getFile, putFile, StorageError } from '@/lib/storage';
import { sanitizeFilename, sniffContent, validateResumeFile } from '@/lib/uploads/validation';
import { refreshProfileCompletion } from './profile';
import { recordPortalAudit } from '@/lib/portal/audit';
import {
  requireEntitlement,
  requireEntitlementWith,
  type DbExecutor
} from '@/lib/portal/premium/entitlements';
import { CANDIDATE_ENTITLEMENT_CODES } from '@/lib/portal/premium/entitlement-codes';

/**
 * Resume and Resume Builder backend (see §5).
 *
 * Security model — resumes are the most sensitive data on the platform:
 *  - Files are stored under a server-generated, opaque storage key OUTSIDE the
 *    public directory. There is no route that maps a key to a public file, so a
 *    resume can never be fetched by guessing a URL.
 *  - Every read goes through an authorization check first, and each successful
 *    read is written to `resume_access_logs` so the candidate has an access
 *    trail.
 *  - An employer may read a candidate's resume ONLY through a real application
 *    to their own company's job. There is no unrestricted browse endpoint.
 *  - Content is validated by extension, declared MIME type AND real byte
 *    signatures, so a renamed executable is never stored.
 *  - Multiple resumes per candidate and multiple versions per resume are
 *    first-class, not a single hard-coded record.
 */

export interface ResumeSummary {
  id: string;
  label: string;
  isDefault: boolean;
  templateCode: string | null;
  latestVersion: number | null;
  latestUploadedAt: string | null;
  createdAt: string;
}

/**
 * Creates an empty resume container for a candidate.
 *
 * PREMIUM TEMPLATES ARE A PAID CAPABILITY, ENFORCED HERE. `isPremium` on a
 * template row is not decoration: selecting one requires the
 * `professional_resume_templates` entitlement, checked server-side before the
 * row is written. A candidate who could pass a premium `templateCode` without
 * paying would be getting the sold product for free, and the check has to live
 * on the server because the template code arrives in a request body.
 *
 * A template that does not exist, or is inactive, is NOT an error: the resume is
 * still created with no template. Typing an unknown code should not lose
 * somebody's work.
 */
export async function createResume(
  candidateId: string,
  input: { label: string; templateCode?: string | null; makeDefault?: boolean }
): Promise<ResumeRow> {
  const { db } = dbFromRequest();

  const label = input.label.trim().slice(0, 120) || 'My resume';

  let templateId: string | null = null;
  if (input.templateCode) {
    const [template] = await db
      .select({ id: resumeTemplates.id, isPremium: resumeTemplates.isPremium })
      .from(resumeTemplates)
      .where(
        and(
          eq(resumeTemplates.code, input.templateCode),
          eq(resumeTemplates.isActive, true)
        )
      )
      .limit(1);

    if (template) {
      // Throws 403 when the candidate lacks the entitlement.
      if (template.isPremium) {
        await requireEntitlement(
          candidateId,
          CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES
        );
      }
      templateId = template.id;
    }
  }

  const { db: exec } = dbFromRequest();
  return exec.transaction(async (tx) => {
    // At most one default per candidate.
    if (input.makeDefault) {
      await tx
        .update(resumes)
        .set({ isDefault: false })
        .where(and(eq(resumes.candidateId, candidateId), eq(resumes.isDefault, true)));
    }

    const [row] = await tx
      .insert(resumes)
      .values({ candidateId, label, templateId, isDefault: input.makeDefault ?? false })
      .returning();

    return row;
  });
}

/** Resumes owned by the candidate, with their latest version. */
export async function listResumes(candidateId: string): Promise<ResumeSummary[]> {
  const { db } = dbFromRequest();

  const rows = await db
    .select({
      resume: resumes,
      templateCode: resumeTemplates.code,
      latestVersion: sql<number | null>`(
        SELECT MAX(v.version_number) FROM resume_versions v WHERE v.resume_id = ${resumes.id}
      )`,
      latestUploadedAt: sql<Date | null>`(
        SELECT MAX(v.created_at) FROM resume_versions v WHERE v.resume_id = ${resumes.id}
      )`,
    })
    .from(resumes)
    .leftJoin(resumeTemplates, eq(resumes.templateId, resumeTemplates.id))
    .where(and(eq(resumes.candidateId, candidateId), eq(resumes.isArchived, false)))
    .orderBy(desc(resumes.isDefault), desc(resumes.updatedAt));

  return rows.map((row) => ({
    id: row.resume.id,
    label: row.resume.label,
    isDefault: row.resume.isDefault,
    templateCode: row.templateCode,
    latestVersion: row.latestVersion,
    latestUploadedAt: row.latestUploadedAt ? row.latestUploadedAt.toISOString() : null,
    createdAt: row.resume.createdAt.toISOString(),
  }));
}

/** Sets the default resume and unsets any other, atomically. */
export async function setDefaultResume(candidateId: string, resumeId: string): Promise<void> {
  const { db } = dbFromRequest();

  await db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.candidateId, candidateId)))
      .limit(1);
    if (!owned) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume was not found.', 404);
    }

    await tx
      .update(resumes)
      .set({ isDefault: false })
      .where(eq(resumes.candidateId, candidateId));
    await tx.update(resumes).set({ isDefault: true }).where(eq(resumes.id, resumeId));
  });
}

/** Archives (soft-deletes) a resume and removes its stored files. */
export async function deleteResume(candidateId: string, resumeId: string): Promise<boolean> {
  const { db } = dbFromRequest();

  const [owned] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.candidateId, candidateId)))
    .limit(1);
  if (!owned) return false;

  // Collect the storage keys before the rows cascade away.
  const versions = await db
    .select({ storageKey: resumeVersions.storageKey, pdfStorageKey: resumeVersions.pdfStorageKey })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(eq(resumes.id, resumeId));

  await db.delete(resumes).where(eq(resumes.id, resumeId));

  // Best-effort file cleanup: a failure must not block the delete. Builder-created
  // versions have no uploaded source document, so both keys are nullable.
  for (const version of versions) {
    try {
      if (version.storageKey) await deleteFile(version.storageKey);
      if (version.pdfStorageKey) await deleteFile(version.pdfStorageKey);
    } catch {
      // ignore
    }
  }

  await refreshProfileCompletion(candidateId);
  return true;
}

export interface UploadResumeInput {
  candidateId: string;
  resumeId: string;
  filename: string;
  contentType: string | null;
  body: Buffer;
  /** Structured Resume Builder content stored alongside the document. */
  contentJson?: Record<string, unknown> | null;
}

/**
 * How many versions of one resume a candidate may keep without paying.
 *
 * `multiple_resume_versions` is described in the database as "keep several
 * tailored resume versions and pick one per application". A single version is
 * therefore usable by everybody, and the SECOND one onwards is the paid
 * capability.
 *
 * This is enforced inside `uploadResumeVersion` as well as builder version
 * creation on purpose: gating only the builder would let a candidate mint
 * unlimited "versions" by uploading files instead, which would make the
 * entitlement decorative — exactly the failure mode the `resume_templates`
 * seeding migration warns about.
 */
export const FREE_VERSION_LIMIT = 1;

/**
 * Throws 403 when this resume already has as many versions as the candidate is
 * entitled to. Call inside the version-creating transaction so two parallel
 * requests cannot both pass the count and both insert.
 */
export async function assertVersionAllowance(
  candidateId: string,
  resumeId: string,
  tx: DbExecutor
): Promise<void> {
  const [countRow] = await tx
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, resumeId));

  if ((countRow?.value ?? 0) < FREE_VERSION_LIMIT) return;

  // Deliberately the transactional form, not `requireEntitlement`: this runs
  // while the caller still holds the transaction, and a root-connection query
  // there deadlocks PGlite and a single-connection pool. Checking on `tx` also
  // closes the TOCTOU window the doc comment promises.
  await requireEntitlementWith(tx, candidateId, CANDIDATE_ENTITLEMENT_CODES.MULTIPLE_VERSIONS);
}

/** Either the root database or an existing transaction, for composable helpers. */
export type { DbExecutor };

/**
 * Uploads a new VERSION of a resume.
 *
 * Validation is threefold: extension allowlist, declared MIME type, and the
 * actual byte signature. The browser's filename is only used for a safe
 * display name; the storage key is generated entirely server-side.
 */
export async function uploadResumeVersion(
  input: UploadResumeInput
): Promise<ResumeVersionRow> {
  const { db } = dbFromRequest();

  const validation = validateResumeFile(
    { filename: input.filename, contentType: input.contentType, byteSize: input.body.byteLength },
    config.PORTAL_MAX_RESUME_BYTES
  );
  if (!validation.ok) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, validation.error, 400);
  }

  // Defence in depth: the bytes must match the claimed extension.
  const contentError = sniffContent(input.body, validation.file.extension);
  if (contentError) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, contentError, 400);
  }

  const [owned] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, input.resumeId), eq(resumes.candidateId, input.candidateId)))
    .limit(1);
  if (!owned) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume was not found.', 404);
  }

  let stored;
  try {
    stored = await putFile(validation.file.extension, input.body, validation.file.mimeType);
  } catch (error) {
    if (error instanceof StorageError) {
      throw new AppError(AppErrorCode.INTERNAL_ERROR, 'The resume could not be stored.', 500);
    }
    throw error;
  }

  // The next version number is computed inside the transaction so two parallel
  // uploads cannot claim the same number.
  const versionRow = await db.transaction(async (tx) => {
    // Entitlement gate lives inside the transaction so a second parallel upload
    // cannot slip past the count.
    await assertVersionAllowance(input.candidateId, input.resumeId, tx);

    const [maxRow] = await tx
      .select({ value: sql<number>`COALESCE(MAX(version_number), 0)::int` })
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, input.resumeId));

    const nextVersion = (maxRow?.value ?? 0) + 1;

    const [row] = await tx
      .insert(resumeVersions)
      .values({
        resumeId: input.resumeId,
        versionNumber: nextVersion,
        storageKey: stored.storageKey,
        originalFilename: sanitizeFilename(input.filename),
        mimeType: validation.file.mimeType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        contentJson: input.contentJson ?? null,
      })
      .returning();

    return row;
  });

  await refreshProfileCompletion(input.candidateId);
  return versionRow;
}

/** Versions of one resume, newest first. */
export async function listResumeVersions(
  candidateId: string,
  resumeId: string
): Promise<ResumeVersionRow[]> {
  const { db } = dbFromRequest();

  // The join proves ownership, so another candidate's resume id returns nothing.
  return db
    .select({ version: resumeVersions })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(and(eq(resumes.id, resumeId), eq(resumes.candidateId, candidateId)))
    .orderBy(desc(resumeVersions.versionNumber))
    .then((rows) => rows.map((row) => row.version));
}

/** Stores the Resume Builder snapshot against a specific version. */
export async function saveResumeBuilderContent(
  candidateId: string,
  versionId: string,
  contentJson: Record<string, unknown>
): Promise<ResumeVersionRow> {
  const { db } = dbFromRequest();

  const [row] = await db
    .update(resumeVersions)
    .set({ contentJson })
    .where(
      and(
        eq(resumeVersions.id, versionId),
        sql`${resumeVersions.resumeId} IN (SELECT id FROM resumes WHERE id = ${resumeVersions.resumeId} AND candidate_id = ${candidateId})`
      )
    )
    .returning();

  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume version was not found.', 404);
  }
  return row;
}

/* -------------------------------------------------------------------------
 * Authorized resume access
 * ---------------------------------------------------------------------- */

export interface ResumeAccessContext {
  /** Set when the reader is a candidate reading their own resume. */
  candidateProfileId?: string;
  /** Set when the reader is an employer user. */
  employerUserId?: string;
  /** Set when the reader is an administrator. */
  adminUserId?: string;
  /** Employer company, used for the application check. */
  companyId?: string;
}

/** Who may read a given resume version, and why. */
export interface AccessDecision {
  allowed: boolean;
  reason: string;
  applicationId: string | null;
}

/**
 * Decides whether a reader may read a resume version.
 *
 * An employer is allowed ONLY through a real application to a job belonging to
 * their own company. There is deliberately no "browse all candidates" path.
 */
export async function decideAccess(
  versionId: string,
  ctx: ResumeAccessContext
): Promise<AccessDecision> {
  const { db } = dbFromRequest();

  const [row] = await db
    .select({
      candidateId: resumes.candidateId,
      storageKey: resumeVersions.storageKey,
      pdfStorageKey: resumeVersions.pdfStorageKey,
      originalFilename: resumeVersions.originalFilename,
      mimeType: resumeVersions.mimeType,
      versionId: resumeVersions.id,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(eq(resumeVersions.id, versionId))
    .limit(1);

  if (!row) {
    return { allowed: false, reason: 'not_found', applicationId: null };
  }

  // Administrator oversight.
  if (ctx.adminUserId) {
    return { allowed: true, reason: 'admin_oversight', applicationId: null };
  }

  // The candidate's own resume.
  if (ctx.candidateProfileId && ctx.candidateProfileId === row.candidateId) {
    return { allowed: true, reason: 'owner', applicationId: null };
  }

  // An employer, but only through an application to their own company's job.
  if (ctx.employerUserId) {
    const [application] = await db
      .select({ id: jobApplications.id, resumeVersionId: jobApplications.resumeVersionId })
      .from(jobApplications)
      .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
      .where(
        and(
          // The job must belong to the caller's own company.
          eq(jobs.companyId, ctx.companyId ?? ''),
          eq(jobApplications.candidateId, row.candidateId),
          sql`${jobApplications.resumeVersionId} IS NOT NULL`
        )
      )
      .orderBy(desc(jobApplications.appliedAt))
      .limit(1);

    if (!application) {
      return { allowed: false, reason: 'no_application', applicationId: null };
    }

    // The employer may read the exact version submitted with that application.
    // A newer version stays private until the candidate applies again.
    if (application.resumeVersionId !== versionId) {
      return { allowed: false, reason: 'different_version', applicationId: application.id };
    }

    return { allowed: true, reason: 'application', applicationId: application.id };
  }

  return { allowed: false, reason: 'unauthorized', applicationId: null };
}

export interface AuthorizedResumeFile {
  body: Buffer;
  filename: string;
  mimeType: string;
  accessId: string;
}

/**
 * Reads a resume file after an authorization check, and records the access.
 *
 * A denied read returns "not found" so an employer cannot probe for the
 * existence of a resume id they are not entitled to.
 */
export async function readResumeForAuthorizedViewer(
  versionId: string,
  ctx: ResumeAccessContext
): Promise<AuthorizedResumeFile> {
  const { db } = dbFromRequest();

  const decision = await decideAccess(versionId, ctx);
  if (!decision.allowed) {
    throw new AppError(
      AppErrorCode.NOT_FOUND,
      'The requested resume was not found.',
      404
    );
  }

  const [row] = await db
    .select({
      storageKey: resumeVersions.storageKey,
      originalFilename: resumeVersions.originalFilename,
      mimeType: resumeVersions.mimeType,
      source: resumeVersions.source,
    })
    .from(resumeVersions)
    .where(eq(resumeVersions.id, versionId))
    .limit(1);

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume was not found.', 404);

  // A version created in the resume builder has no uploaded document behind it,
  // so there is no source file to hand back. Callers wanting the rendered document
  // must ask for the generated PDF instead.
  if (!row.storageKey || !row.originalFilename || !row.mimeType) {
    throw new AppError(
      AppErrorCode.BAD_REQUEST,
      'This resume version was created in the builder and has no uploaded file.',
      409
    );
  }

  const body = await getFile(row.storageKey);

  // The access is recorded so the candidate (and an admin) can see who read it.
  const [log] = await db
    .insert(resumeAccessLogs)
    .values({
      resumeVersionId: versionId,
      viewerUserId: ctx.employerUserId ?? ctx.adminUserId ?? null,
      applicationId: decision.applicationId,
      accessReason: decision.reason,
    })
    .returning({ id: resumeAccessLogs.id });

  return {
    body,
    filename: row.originalFilename,
    mimeType: row.mimeType,
    accessId: log.id,
  };
}

/** Access history for one resume version, for the candidate to review. */
export async function listResumeAccessLogs(
  candidateId: string,
  versionId: string
): Promise<
  Array<{ id: string; reason: string; applicationId: string | null; accessedAt: string }>
> {
  const { db } = dbFromRequest();

  const rows = await db
    .select({
      id: resumeAccessLogs.id,
      accessReason: resumeAccessLogs.accessReason,
      applicationId: resumeAccessLogs.applicationId,
      createdAt: resumeAccessLogs.createdAt,
    })
    .from(resumeAccessLogs)
    .innerJoin(resumeVersions, eq(resumeAccessLogs.resumeVersionId, resumeVersions.id))
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(and(eq(resumeVersions.id, versionId), eq(resumes.candidateId, candidateId)))
    .orderBy(desc(resumeAccessLogs.createdAt));

  return rows.map((row) => ({
    id: row.id,
    reason: row.accessReason,
    applicationId: row.applicationId,
    accessedAt: row.createdAt.toISOString(),
  }));
}

/** Active resume templates, for the Resume Builder. */
export async function listResumeTemplates(): Promise<
  Array<{ id: string; code: string; name: string; description: string | null; isPremium: boolean }>
> {
  const { db } = dbFromRequest();
  return db
    .select({
      id: resumeTemplates.id,
      code: resumeTemplates.code,
      name: resumeTemplates.name,
      description: resumeTemplates.description,
      isPremium: resumeTemplates.isPremium,
    })
    .from(resumeTemplates)
    .where(eq(resumeTemplates.isActive, true))
    .orderBy(resumeTemplates.name);
}


/**
 * Records a resume read in the audit trail, alongside the per-version access log
 * the candidate can review. Metadata carries identifiers only.
 */
export async function auditResumeRead(input: {
  actorUserId: string | null;
  versionId: string;
  reason: string;
  applicationId?: string | null;
}): Promise<void> {
  await recordPortalAudit({
    action: 'resume_downloaded',
    actorUserId: input.actorUserId,
    description: `Resume read (${input.reason})`,
    metadata: {
      versionId: input.versionId,
      reason: input.reason,
      applicationId: input.applicationId ?? null,
    },
  });
}

