import { and, count, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  auditLogs,
  candidateProfiles,
  companies,
  companyMembers,
  jobs,
  resumes,
  users,
} from "@/lib/db/schema";
import { hasCompanyFeature } from "@/lib/entitlements";
import { getSiteSettings } from "@/lib/settings";

/**
 * Authorisation for reading a stored resume.
 *
 * - The owner can always read their own resume.
 * - A recruiter can read an application resume for their company, or a
 *   discoverable resume when their plan and configured monthly view limit allow it.
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
  if (await recruiterMayReadApplicationResume(resumeId, viewerUserId)) return true;

  const memberships = await db
    .select({
      companyId: companyMembers.companyId,
      candidateUserId: candidateProfiles.userId,
    })
    .from(resumes)
    .innerJoin(candidateProfiles, eq(candidateProfiles.userId, resumes.userId))
    .innerJoin(
      companyMembers,
      and(
        eq(companyMembers.userId, viewerUserId),
        eq(companyMembers.status, "active"),
      ),
    )
    .where(and(
      eq(resumes.id, resumeId),
      eq(candidateProfiles.discoverable, true),
      isNull(resumes.deletedAt),
    ));
  const eligibleCompany = await firstEnabledResumeDatabaseCompany(memberships.map((m) => m.companyId));
  if (!eligibleCompany) return false;

  const settings = await getSiteSettings();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  return db.transaction(async (tx) => {
    await tx.select({ id: users.id })
      .from(users)
      .where(eq(users.id, viewerUserId))
      .for("update");
    const [usage] = await tx.select({ total: count() })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.actorUserId, viewerUserId),
        eq(auditLogs.action, "candidate.resume_viewed"),
        gte(auditLogs.createdAt, monthStart),
      ));
    if ((usage?.total ?? 0) >= settings.resumeDbViewLimit) return false;
    await tx.insert(auditLogs).values({
      actorUserId: viewerUserId,
      actorRole: "recruiter",
      action: "candidate.resume_viewed",
      entityType: "resume",
      entityId: resumeId,
      description: "Resume accessed through recruiter candidate search.",
      metadata: {
        companyId: eligibleCompany,
        candidateUserId: memberships[0]?.candidateUserId,
      },
    });
    return true;
  });
}

async function recruiterMayReadApplicationResume(
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
    .where(eq(applications.resumeId, resumeId))
    .limit(1);
  return Boolean(rows.at(0));
}

async function firstEnabledResumeDatabaseCompany(companyIds: string[]): Promise<string | null> {
  for (const companyId of [...new Set(companyIds)]) {
    const [company] = await db.select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.status, "approved")))
      .limit(1);
    if (!company) continue;
    if (await hasCompanyFeature(companyId, "resume_database")) return companyId;
  }
  return null;
}