import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { requireUserFeature } from "@/lib/entitlements";
import {
  deleteStoredFile,
  readValidatedUpload,
  storeValidatedFile,
} from "@/lib/storage";

/** Candidate resume uploads (PDF / DOC / DOCX, max 5 MB). */

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
export const RESUME_MAX_COUNT = 10;

export const RESUME_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export type ResumeRow = typeof resumes.$inferSelect;

export async function listResumes(userId: string): Promise<ResumeRow[]> {
  return db
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, userId), isNull(resumes.deletedAt)))
    .orderBy(desc(resumes.isDefault), desc(resumes.createdAt));
}

export async function uploadResume(
  userId: string,
  file: File,
  label?: string | null,
): Promise<string> {
  await requireUserFeature(userId, "resume_upload");

  const existing = await listResumes(userId);
  if (existing.length >= RESUME_MAX_COUNT) {
    throw new AppError(
      `You can store at most ${RESUME_MAX_COUNT} resumes. Delete one to upload another.`,
      400,
      "too_many_resumes",
    );
  }

  const { buffer, mimeType } = await readValidatedUpload(file, {
    allowedMimes: RESUME_MIME_TYPES,
    maxBytes: RESUME_MAX_BYTES,
  });

  const stored = await storeValidatedFile("resumes", buffer, mimeType);

  const inserted = await db
    .insert(resumes)
    .values({
      userId,
      label: label?.trim() || null,
      originalName: file.name,
      storagePath: stored.storagePath,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      isDefault: existing.length === 0,
    })
    .returning({ id: resumes.id });

  return inserted[0]!.id;
}

/** Ownership-checked resume lookup - never returns someone else's file. */
export async function getOwnedResume(
  userId: string,
  resumeId: string,
): Promise<ResumeRow> {
  const rows = await db
    .select()
    .from(resumes)
    .where(
      and(
        eq(resumes.id, resumeId),
        eq(resumes.userId, userId),
        isNull(resumes.deletedAt),
      ),
    )
    .limit(1);

  const row = rows.at(0);
  if (!row) throw new NotFoundError("Resume not found.");
  return row;
}

export async function setDefaultResume(
  userId: string,
  resumeId: string,
): Promise<void> {
  await getOwnedResume(userId, resumeId);
  await db.update(resumes).set({ isDefault: false }).where(eq(resumes.userId, userId));
  await db.update(resumes).set({ isDefault: true }).where(eq(resumes.id, resumeId));
}

export async function deleteResume(userId: string, resumeId: string): Promise<void> {
  const resume = await getOwnedResume(userId, resumeId);

  await db
    .update(resumes)
    .set({ deletedAt: new Date(), isDefault: false })
    .where(eq(resumes.id, resumeId));

  await deleteStoredFile(resume.storagePath);

  // Promote another resume to default when the deleted one was the default.
  if (resume.isDefault) {
    const remaining = await listResumes(userId);
    const next = remaining.at(0);
    if (next) await setDefaultResume(userId, next.id);
  }
}

export async function countResumes(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(resumes)
    .where(and(eq(resumes.userId, userId), sql`${resumes.deletedAt} is null`));
  return rows.at(0)?.value ?? 0;
}