import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { builtResumeVersions, builtResumes } from "@/lib/db/schema";
import { getCandidateEntitlements } from "@/lib/entitlements";
import type { BuiltResumeData, ResumeTemplate } from "./resume-pdf";

export type BuiltResumeRow = typeof builtResumes.$inferSelect;

export async function listBuiltResumes(userId: string): Promise<BuiltResumeRow[]> {
  return db
    .select()
    .from(builtResumes)
    .where(and(eq(builtResumes.userId, userId), isNull(builtResumes.deletedAt)))
    .orderBy(desc(builtResumes.isPrimary), desc(builtResumes.updatedAt));
}

export async function getBuiltResumeVersions(resumeId: string, userId: string) {
  const rows = await db
    .select({
      id: builtResumeVersions.id,
      version: builtResumeVersions.version,
      createdAt: builtResumeVersions.createdAt,
    })
    .from(builtResumeVersions)
    .innerJoin(
      builtResumes,
      eq(builtResumes.id, builtResumeVersions.builtResumeId),
    )
    .where(
      and(
        eq(builtResumes.id, resumeId),
        eq(builtResumes.userId, userId),
        isNull(builtResumes.deletedAt),
      ),
    )
    .orderBy(desc(builtResumeVersions.version));
  return rows;
}

export async function candidateResumeBuilderAccess(userId: string) {
  const features = await getCandidateEntitlements(userId);
  return {
    premium: features.get("resume_builder")?.enabled === true,
    templateLimit: features.get("resume_templates")?.limit ?? 1,
    versionLimit: features.get("resume_versions")?.limit ?? 1,
    professionalTemplates:
      features.get("resume_builder")?.enabled === true &&
      features.get("resume_templates")?.enabled === true &&
      (features.get("resume_templates")?.limit === null ||
        (features.get("resume_templates")?.limit ?? 1) > 1),
  };
}

export function emptyBuiltResumeData(): BuiltResumeData {
  return {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    headline: "",
    summary: "",
    experience: "",
    education: "",
    skills: "",
  };
}

export function builtResumeDataFromRecord(
  value: Record<string, unknown>,
): BuiltResumeData {
  const read = (key: keyof BuiltResumeData) =>
    typeof value[key] === "string" ? (value[key] as string) : "";
  return {
    fullName: read("fullName"),
    email: read("email"),
    phone: read("phone"),
    location: read("location"),
    headline: read("headline"),
    summary: read("summary"),
    experience: read("experience"),
    education: read("education"),
    skills: read("skills"),
  };
}

export function isResumeTemplate(value: string): value is ResumeTemplate {
  return value === "classic" || value === "modern" || value === "minimal";
}
