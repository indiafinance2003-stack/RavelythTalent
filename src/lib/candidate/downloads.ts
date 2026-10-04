import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companyMembers, jobs, resumes } from "@/lib/db/schema";

/**
 * Authorisation for reading a stored resume.
 *
 * - The owner can always read their own resume.
 * - A recruiter can read a resume only if they are an active member of the
 *   company that owns the job the resume was submitted against.
 * - Everyone else gets the same 404 as a non-existent file (no existence leak).
 */

export type ResumeDownloadAccess = {
  storagePath: string;
  mimeType: string;
  downloadName: string;
};

export function resumeDownloadNotFound() {
  return {
    ok: false,
    error: { code: "not_found", message: "Resume not found." },
  };
}

export async function resumeDownloadAuthorised(
  resumeId: string,
  viewerUserId: string,
  viewerRole: "job_seeker" | "recruiter" | "admin",
): Promise<ResumeDownloadAccess | null> {
  const resume = await db
    .select({
      id: resumes.id,
      userId: resumes.userId,
      storagePath: resumes.storagePath,
      mimeType: resumes.mimeType,
      originalName: resumes.originalName,
    })
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), isNull(resumes.deletedAt)))
    .limit(1);

  const row = resume.at(0);
  if (!row) return null;

  const allowed =
    viewerRole === "admin" ||
    row.userId === viewerUserId ||
    (await recruiterMayReadResume(resumeId, viewerUserId));

  if (!allowed) return null;

  return {
    storagePath: row.storagePath,
    mimeType: row.mimeType,
    downloadName: row.originalName,
  };
}

async function recruiterMayReadResume(
  resumeId: string,
  viewerUserId: string,
): Promise<boolean> {
  const rows = await db
    .select({ companyId: jobs.companyId })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(
      companyMembers,
      and(
        eq(companyMembers.companyId, jobs.companyId),
        eq(companyMembers.userId, viewerUserId),
        eq(companyMembers.status, "active"),
      ),
    )
    .where(and(eq(applications.resumeId, resumeId)))
    .limit(1);

  return Boolean(rows.at(0));
}