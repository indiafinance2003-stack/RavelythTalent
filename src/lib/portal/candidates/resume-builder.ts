import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  resumeAccessLogs,
  resumes,
  resumeTemplates,
  resumeVersions,
  type ResumeVersionRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { deleteFile, getFile, putFile, StorageError } from '@/lib/storage';
import { sanitizeFilename } from '@/lib/uploads/validation';
import { renderResumePdf } from '@/lib/pdf/resume';
import {
  emptyResumeDocument,
  parseResumeDocument,
  presentSections,
  ResumeContentError,
  resumeDocumentCompletion,
  safeParseResumeDocument,
  type ResumeDocument,
} from '@/lib/resume/content';
import {
  isResumeTemplateCode,
  type ResumeTemplateCode,
} from '@/lib/resume/templates';
import { requireEntitlement } from '@/lib/portal/premium/entitlements';
import { CANDIDATE_ENTITLEMENT_CODES } from '@/lib/portal/premium/entitlement-codes';
import {
  assertVersionAllowance,
  decideAccess,
  type DbExecutor,
  type ResumeAccessContext,
} from './resumes';
import { refreshProfileCompletion } from './profile';

/**
 * Structured Resume Builder: drafts, version snapshots, and PDF export.
 *
 * THE TWO-LAYER MODEL
 * -------------------
 * `resumes.builder_content_json` is the WORKING COPY — the document the
 * candidate is editing right now. It is deliberately mutable and does NOT mint a
 * version on every keystroke, which is what makes "save, close the tab, come back
 * tomorrow" work.
 *
 * `resume_versions.content_json` is an immutable SNAPSHOT, created only when the
 * candidate explicitly saves a version. That snapshot is what gets rendered to a
 * PDF and what an employer is ever allowed to read.
 *
 * Conflating the two is the bug this split exists to prevent: if saving a draft
 * also minted a version, the history would fill with autosaves and "pick one per
 * application" would become meaningless.
 *
 * EVERY PAID CAPABILITY IS CHECKED HERE, ON THE SERVER
 * ---------------------------------------------------
 * The four builder entitlements are enforced in this module rather than in the
 * route handlers or the client, because all four inputs (document, template code,
 * version id, storage key) originate in a request. A check that lives in the
 * browser is a suggestion.
 */

export interface BuilderDraftDTO {
  resumeId: string;
  label: string;
  templateCode: string | null;
  document: ResumeDocument;
  /** 0-100, for the builder's completeness hint. Never an entitlement check. */
  completion: number;
  /** Sections that actually have content, in render order. */
  sections: string[];
  updatedAt: string;
}

/** Browser-safe summary of one snapshot. Carries no storage key, by design. */
export interface BuilderVersionDTO {
  id: string;
  versionNumber: number;
  source: string;
  label: string | null;
  isDefault: boolean;
  /** True when a generated PDF is stored and downloadable. */
  hasPdf: boolean;
  pdfByteSize: number | null;
  /** Set when the snapshot holds renderable structured content. */
  hasContent: boolean;
  /** False when there is no uploaded source document (builder-created). */
  hasUpload: boolean;
  createdAt: string;
}

/**
 * Turns a builder-content payload into a 400 with readable field paths.
 *
 * `parseResumeDocument` deliberately throws instead of silently emptying the
 * document, so the message has to survive the trip to the browser intact.
 */
function parseOrThrow400(input: unknown): ResumeDocument {
  try {
    return parseResumeDocument(input);
  } catch (error) {
    if (error instanceof ResumeContentError) {
      throw new AppError(
        AppErrorCode.VALIDATION_ERROR,
        `The resume content is not valid: ${error.issues.join('; ')}`,
        400
      );
    }
    throw error;
  }
}

/**
 * Resolves a template code to its row, enforcing the premium gate.
 *
 * Returns null for an unknown or inactive code rather than throwing: choosing a
 * template should never be able to lose somebody's saved content. A PREMIUM code
 * is different — that is a paid product, so it is refused with 403.
 */
async function resolveTemplateId(
  candidateId: string,
  templateCode: string | null | undefined
): Promise<string | null> {
  if (!templateCode) return null;

  const { db } = dbFromRequest();
  const [template] = await db
    .select({ id: resumeTemplates.id, isPremium: resumeTemplates.isPremium })
    .from(resumeTemplates)
    .where(and(eq(resumeTemplates.code, templateCode), eq(resumeTemplates.isActive, true)))
    .limit(1);

  // Unknown or retired: fall back to "no template" (the renderer uses the default).
  if (!template) return null;

  if (template.isPremium) {
    await requireEntitlement(candidateId, CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES);
  }
  return template.id;
}

/** The resume row, proving the candidate owns it. 404s on someone else's id. */
async function loadOwnedResume(candidateId: string, resumeId: string) {
  const { db } = dbFromRequest();
  const [row] = await db
    .select({
      id: resumes.id,
      label: resumes.label,
      templateId: resumes.templateId,
      builderContentJson: resumes.builderContentJson,
      templateCode: resumeTemplates.code,
      updatedAt: resumes.updatedAt,
    })
    .from(resumes)
    .leftJoin(resumeTemplates, eq(resumes.templateId, resumeTemplates.id))
    .where(and(eq(resumes.id, resumeId), eq(resumes.candidateId, candidateId)))
    .limit(1);

  // Deliberately indistinguishable from "does not exist": a candidate must not be
  // able to learn that another candidate's resume id exists.
  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume was not found.', 404);
  }
  return row;
}

/**
 * The candidate's working copy, or an empty document when they have never saved.
 *
 * Reading is NOT gated: a candidate whose plan lapsed must still be able to see
 * and export the work they already have. Only WRITING is a paid capability.
 */
export async function getBuilderDraft(
  candidateId: string,
  resumeId: string
): Promise<BuilderDraftDTO> {
  const resume = await loadOwnedResume(candidateId, resumeId);

  const stored = resume.builderContentJson;
  let document: ResumeDocument;
  if (stored) {
    // If stored content cannot be read, fail loudly instead of showing an empty
    // document: a blank builder invites a save that would overwrite whatever the
    // real content was. This data is written through the same validator, so an
    // unreadable draft means the row was modified outside the application.
    document =
      safeParseResumeDocument(stored) ??
      (() => {
        throw new AppError(
          AppErrorCode.INTERNAL_ERROR,
          'The saved resume content could not be read and must be recovered before it can be edited.',
          500
        );
      })();
  } else {
    document = emptyResumeDocument(resume.label);
  }

  return {
    resumeId: resume.id,
    label: resume.label,
    templateCode: resume.templateCode,
    document,
    completion: resumeDocumentCompletion(document),
    sections: presentSections(document),
    updatedAt: resume.updatedAt.toISOString(),
  };
}

/**
 * Saves the working copy.
 *
 * This is the `resume_builder_premium` gate: "build and maintain resumes with
 * structured content". A candidate who never paid can still create a resume,
 * upload a document and apply — they just cannot compose one here.
 */
export async function saveBuilderDraft(
  candidateId: string,
  resumeId: string,
  input: { document: unknown; templateCode?: string | null; label?: string }
): Promise<BuilderDraftDTO> {
  // The template gate runs FIRST so a request without the premium plan gets the
  // specific 403 about templates rather than a generic builder message.
  const templateId = await resolveTemplateId(candidateId, input.templateCode);

  await requireEntitlement(candidateId, CANDIDATE_ENTITLEMENT_CODES.RESUME_BUILDER);

  const document = parseOrThrow400(input.document);
  const label = input.label?.trim().slice(0, 120) || undefined;

  const { db } = dbFromRequest();
  await db
    .update(resumes)
    .set({
      builderContentJson: document as unknown as Record<string, unknown>,
      ...(templateId !== null ? { templateId } : {}),
      ...(label ? { label } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(resumes.id, resumeId), eq(resumes.candidateId, candidateId)));

  // Re-read through the ownership check so the response cannot describe a row
  // the update silently missed.
  await loadOwnedResume(candidateId, resumeId);
  return getBuilderDraft(candidateId, resumeId);
}

/**
 * Snapshots the working copy into a new immutable version.
 *
 * Refuses to snapshot an empty document: a version is something the candidate
 * chose to keep and can apply with, so an empty one would be noise in the history
 * and an empty PDF if exported.
 */
export async function createBuilderVersion(
  candidateId: string,
  resumeId: string,
  input: { label?: string | null } = {}
): Promise<BuilderVersionDTO> {
  const { db } = dbFromRequest();
  const resume = await loadOwnedResume(candidateId, resumeId);

  if (!resume.builderContentJson) {
    throw new AppError(
      AppErrorCode.BAD_REQUEST,
      'Save your resume content before creating a version.',
      409
    );
  }

  const document = parseOrThrow400(resume.builderContentJson);
  if (presentSections(document).length === 0) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'This resume has no content to save as a version yet.',
      400
    );
  }

  const row = await db.transaction(async (tx) => {
    // Throws 403 once the candidate is at their allowance. Inside the transaction
    // so two parallel clicks cannot both pass the count.
    await assertVersionAllowance(candidateId, resumeId, tx);

    const [maxRow] = await tx
      .select({ value: sql<number>`COALESCE(MAX(version_number), 0)::int` })
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, resumeId));
    const nextVersion = (maxRow?.value ?? 0) + 1;

    const [inserted] = await tx
      .insert(resumeVersions)
      .values({
        resumeId,
        versionNumber: nextVersion,
        source: 'builder',
        label: input.label?.trim().slice(0, 120) || `Version ${nextVersion}`,
        contentJson: document as unknown as Record<string, unknown>,
        // No storageKey: a builder version has no uploaded source document.
      })
      .returning();

    return inserted;
  });

  await refreshProfileCompletion(candidateId);
  return toVersionDTO(row);
}

function toVersionDTO(row: ResumeVersionRow): BuilderVersionDTO {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    source: row.source,
    label: row.label,
    isDefault: row.isDefault,
    hasPdf: row.pdfStorageKey !== null,
    pdfByteSize: row.pdfByteSize,
    hasContent: row.contentJson !== null && row.contentJson !== undefined,
    hasUpload: row.storageKey !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Maps snapshot rows to browser-safe DTOs. */
function toVersionDTOs(rows: ResumeVersionRow[]): BuilderVersionDTO[] {
  return rows.map(toVersionDTO);
}

/**
 * Lists the version history for a resume.
 *
 * Gated on `resume_version_history` ("review and restore previous versions").
 */
export async function listVersionHistory(
  candidateId: string,
  resumeId: string
): Promise<BuilderVersionDTO[]> {
  // Prove ownership before spending an entitlement query on it.
  await loadOwnedResume(candidateId, resumeId);
  await requireEntitlement(candidateId, CANDIDATE_ENTITLEMENT_CODES.VERSION_HISTORY);

  const { db } = dbFromRequest();
  const rows = await db
    .select({ version: resumeVersions })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(and(eq(resumes.id, resumeId), eq(resumes.candidateId, candidateId)))
    .orderBy(desc(resumeVersions.versionNumber));

  return toVersionDTOs(rows.map((row) => row.version));
}

/**
 * Restores a snapshot into the working copy.
 *
 * Does NOT delete later versions: restoring is a way to start again from an
 * earlier point, not an undo that destroys the history it came from. To keep the
 * restored state itself as a version, the candidate creates a new version after
 * restoring, which is also what makes the change auditable.
 */
export async function restoreVersionToDraft(
  candidateId: string,
  versionId: string
): Promise<BuilderDraftDTO> {
  const { db } = dbFromRequest();

  const [row] = await db
    .select({
      resumeId: resumeVersions.resumeId,
      contentJson: resumeVersions.contentJson,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(
      and(eq(resumeVersions.id, versionId), eq(resumes.candidateId, candidateId))
    )
    .limit(1);

  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume version was not found.', 404);
  }
  if (!row.contentJson) {
    throw new AppError(
      AppErrorCode.BAD_REQUEST,
      'This version has no builder content to restore.',
      409
    );
  }

  await requireEntitlement(candidateId, CANDIDATE_ENTITLEMENT_CODES.VERSION_HISTORY);

  const document = parseOrThrow400(row.contentJson);
  await db
    .update(resumes)
    .set({
      builderContentJson: document as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(and(eq(resumes.id, row.resumeId), eq(resumes.candidateId, candidateId)));

  return getBuilderDraft(candidateId, row.resumeId);
}

export interface ExportedPdfDTO {
  versionId: string;
  templateCode: string | null;
  byteSize: number;
  checksumSha256: string;
  /** Sections the renderer actually printed. */
  renderedSections: string[];
  generatedAt: string;
}

/**
 * Renders a version's structured content to a PDF and stores it privately.
 *
 * WHY THE PREMIUM TEMPLATE IS CHECKED AGAIN HERE
 * ---------------------------------------------
 * The gate already ran when the template was chosen, but a subscription can lapse
 * between choosing a paid layout and pressing "Download PDF". Re-checking at
 * render time means a downgraded candidate falls back to being told to upgrade
 * rather than continuing to produce a premium document from a template they no
 * longer pay for. The check costs one indexed row read.
 *
 * The old PDF is deleted best-effort after the new one is persisted: an orphaned
 * private object is untidy, but failing the whole export because a delete failed
 * would be worse.
 */
export async function exportResumePdf(
  candidateId: string,
  versionId: string
): Promise<ExportedPdfDTO> {
  const { db } = dbFromRequest();

  const [row] = await db
    .select({
      versionId: resumeVersions.id,
      contentJson: resumeVersions.contentJson,
      source: resumeVersions.source,
      resumeId: resumeVersions.resumeId,
      previousPdfKey: resumeVersions.pdfStorageKey,
      templateCode: resumeTemplates.code,
      isPremiumTemplate: resumeTemplates.isPremium,
      resumeLabel: resumes.label,
      candidateId: resumes.candidateId,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .leftJoin(resumeTemplates, eq(resumes.templateId, resumeTemplates.id))
    .where(and(eq(resumeVersions.id, versionId), eq(resumes.candidateId, candidateId)))
    .limit(1);

  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume version was not found.', 404);
  }

  await requireEntitlement(candidateId, CANDIDATE_ENTITLEMENT_CODES.PDF_EXPORT);

  // Re-check the paid layout at render time (see the doc comment).
  if (row.isPremiumTemplate) {
    await requireEntitlement(candidateId, CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES);
  }

  if (!row.contentJson) {
    throw new AppError(
      AppErrorCode.BAD_REQUEST,
      'This version was uploaded as a file and has no structured content to render.',
      409
    );
  }

  const document = parseOrThrow400(row.contentJson);
  const templateCode: ResumeTemplateCode | null =
    row.templateCode && isResumeTemplateCode(row.templateCode) ? row.templateCode : null;
  const generatedAt = new Date();

  const rendered = await renderResumePdf(document, {
    templateCode,
    candidateName: document.basics.fullName?.trim() || row.resumeLabel,
    generatedAt,
  });

  let stored;
  try {
    stored = await putFile('pdf', rendered.body, 'application/pdf');
  } catch (error) {
    if (error instanceof StorageError) {
      throw new AppError(AppErrorCode.INTERNAL_ERROR, 'The PDF could not be stored.', 500);
    }
    throw error;
  }

  await db
    .update(resumeVersions)
    .set({
      pdfStorageKey: stored.storageKey,
      pdfByteSize: stored.byteSize,
      pdfChecksumSha256: stored.checksumSha256,
    })
    .where(eq(resumeVersions.id, row.versionId));

  if (row.previousPdfKey && row.previousPdfKey !== stored.storageKey) {
    try {
      await deleteFile(row.previousPdfKey);
    } catch {
      // Best-effort: an orphaned object is preferable to a failed export.
    }
  }

  return {
    versionId: row.versionId,
    templateCode,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256,
    renderedSections: rendered.renderedSections,
    generatedAt: generatedAt.toISOString(),
  };
}

export interface AuthorizedResumePdf {
  body: Buffer;
  filename: string;
  mimeType: string;
  accessId: string;
}

/**
 * Downloads a generated PDF after the SAME authorization decision as an uploaded
 * resume.
 *
 * Reusing `decideAccess` is deliberate: an employer may read the exact version
 * submitted with an application to their own job and nothing else. That rule must
 * not be weaker for a PDF than for the source document — otherwise switching to a
 * generated PDF would hand out a candidate's private draft.
 *
 * WHY `pdf_resume_export` IS NOT RE-CHECKED HERE
 * ----------------------------------------------
 * That entitlement is spent in `exportResumePdf`, which is what actually costs the
 * candidate something: rendering and storing. Downloading an artifact that already
 * exists is a read, so it follows the same rule as an uploaded file, including for
 * a lapsed candidate who keeps what they already paid to produce. Re-charging the
 * entitlement on every download would also make an employer unable to open a PDF
 * they were legitimately sent because the candidate's subscription later lapsed.
 * The exposure is bounded: `decideAccess` still pins an employer to the exact
 * version attached to their own job's application.
 */
export async function readResumePdfForAuthorizedViewer(
  versionId: string,
  ctx: ResumeAccessContext
): Promise<AuthorizedResumePdf> {
  const { db } = dbFromRequest();

  const decision = await decideAccess(versionId, ctx);
  if (!decision.allowed) {
    // Same "not found" as an unauthorized source read, so the endpoint cannot be
    // used to probe which version ids exist.
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested resume was not found.', 404);
  }

  const [row] = await db
    .select({
      pdfStorageKey: resumeVersions.pdfStorageKey,
      versionNumber: resumeVersions.versionNumber,
      label: resumeVersions.label,
      resumeLabel: resumes.label,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id))
    .where(eq(resumeVersions.id, versionId))
    .limit(1);

  if (!row?.pdfStorageKey) {
    throw new AppError(
      AppErrorCode.NOT_FOUND,
      'No PDF has been generated for this resume version yet.',
      404
    );
  }

  const body = await getFile(row.pdfStorageKey);

  const [log] = await db
    .insert(resumeAccessLogs)
    .values({
      resumeVersionId: versionId,
      viewerUserId: ctx.employerUserId ?? ctx.adminUserId ?? null,
      applicationId: decision.applicationId,
      accessReason: decision.reason,
    })
    .returning({ id: resumeAccessLogs.id });

  const base = row.label || row.resumeLabel || 'resume';
  const filename = sanitizeFilename(`${base}-v${row.versionNumber}.pdf`);

  return { body, filename, mimeType: 'application/pdf', accessId: log.id };
}

/** Executor re-export so callers can compose without importing the resume module. */
export type { DbExecutor };
