import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  candidateProfiles,
  savedCandidates,
  type SavedCandidateRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { requirePlanFeature } from '@/lib/portal/recruiter-plans/service';

/**
 * Saved candidates — the employer's shortlist (see §7 of the brief).
 *
 * Company-scoped with a unique (company_id, candidate_id) index, so one
 * company's shortlist is invisible to another and a double-click cannot create
 * two rows. Saving is an employer-side bookmark: it changes NOTHING the
 * candidate sees and grants no right to their data beyond what they already
 * consented to.
 *
 * The list capability (`saved_candidates`) is a plan feature, enforced before
 * every write — a Basic plan cannot quietly keep a shortlist by calling the
 * API directly.
 */

export interface SavedCandidateDTO {
  id: string;
  candidateId: string;
  fullName: string;
  headline: string | null;
  currentJobTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  openToWork: boolean;
  /** Internal note. Employer-facing only; never part of a candidate DTO. */
  notes: string | null;
  savedAt: string;
}

/**
 * Saves a candidate to the company shortlist (optionally with an internal
 * note). Saving an already-saved candidate updates the note instead of
 * creating a duplicate, so the UI can offer one obvious action.
 */
export async function saveCandidate(input: {
  companyId: string;
  candidateId: string;
  actorUserId: string;
  notes?: string | null;
}): Promise<SavedCandidateRow> {
  await requirePlanFeature(input.companyId, 'saved_candidates');

  const { db } = dbFromRequest();
  const [candidate] = await db
    .select({ id: candidateProfiles.id })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.id, input.candidateId))
    .limit(1);
  if (!candidate) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested candidate was not found.', 404);
  }

  await db
    .insert(savedCandidates)
    .values({
      companyId: input.companyId,
      candidateId: input.candidateId,
      savedByUserId: input.actorUserId,
      notes: input.notes?.trim() || null,
    })
    .onConflictDoNothing();

  // Only overwrite the note when one was actually supplied: a plain re-save
  // must never wipe what the hiring team already wrote.
  if (input.notes !== undefined) {
    await db
      .update(savedCandidates)
      .set({ notes: input.notes?.trim() || null, updatedAt: new Date() })
      .where(
        and(
          eq(savedCandidates.companyId, input.companyId),
          eq(savedCandidates.candidateId, input.candidateId)
        )
      );
  }

  const [row] = await db
    .select()
    .from(savedCandidates)
    .where(
      and(
        eq(savedCandidates.companyId, input.companyId),
        eq(savedCandidates.candidateId, input.candidateId)
      )
    )
    .limit(1);
  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested candidate was not found.', 404);
  }
  return row;
}

/** Removes a candidate from the shortlist. Scoped to the company. */
export async function unsaveCandidate(input: {
  companyId: string;
  candidateId: string;
}): Promise<boolean> {
  await requirePlanFeature(input.companyId, 'saved_candidates');

  const { db } = dbFromRequest();
  const removed = await db
    .delete(savedCandidates)
    .where(
      and(
        eq(savedCandidates.companyId, input.companyId),
        eq(savedCandidates.candidateId, input.candidateId)
      )
    )
    .returning({ id: savedCandidates.id });
  return removed.length > 0;
}

/** The company's shortlist, newest saved first. */
export async function listSavedCandidates(
  companyId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<SavedCandidateDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await db
    .select({
      id: savedCandidates.id,
      candidateId: savedCandidates.candidateId,
      notes: savedCandidates.notes,
      savedAt: savedCandidates.createdAt,
      fullName: candidateProfiles.fullName,
      headline: candidateProfiles.headline,
      currentJobTitle: candidateProfiles.currentJobTitle,
      currentCompany: candidateProfiles.currentCompany,
      location: candidateProfiles.location,
      openToWork: candidateProfiles.openToWork,
    })
    .from(savedCandidates)
    .innerJoin(candidateProfiles, eq(savedCandidates.candidateId, candidateProfiles.id))
    .where(eq(savedCandidates.companyId, companyId))
    .orderBy(desc(savedCandidates.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
    candidateId: row.candidateId,
    fullName: row.fullName,
    headline: row.headline,
    currentJobTitle: row.currentJobTitle,
    currentCompany: row.currentCompany,
    location: row.location,
    openToWork: row.openToWork,
    notes: row.notes,
    savedAt: row.savedAt.toISOString(),
  }));
}