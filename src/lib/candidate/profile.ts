import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidateProfiles,
  candidateSkills,
  education,
  resumes,
  workExperience,
} from "@/lib/db/schema";
import { formError, formSuccess, type FormState } from "@/lib/form-state";

/**
 * Profile completeness is recomputed server-side from real data so the meter
 * can never drift from what recruiters actually see.
 */
export async function computeCompleteness(userId: string): Promise<number> {
  const profile = (
    await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, userId))
      .limit(1)
  ).at(0);

  const profileId = profile?.id;
  if (!profileId) return 0;

  const [educationCount, experienceCount, resumeCount, skillCount] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(education)
      .where(eq(education.candidateProfileId, profileId)),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(workExperience)
      .where(eq(workExperience.candidateProfileId, profileId)),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(resumes)
      .where(and(eq(resumes.userId, userId), isNull(resumes.deletedAt))),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(candidateSkills)
      .where(eq(candidateSkills.candidateProfileId, profileId)),
  ]);

  const checks = [
    Boolean(profile?.headline?.trim()),
    Boolean(profile?.summary?.trim()),
    Boolean(profile?.currentLocation?.trim()),
    Boolean(profile?.currentDesignation?.trim()),
    Boolean(profile?.currentCompany?.trim()),
    Boolean(profile?.totalExperienceMonths),
    (resumeCount.at(0)?.value ?? 0) > 0,
    (educationCount.at(0)?.value ?? 0) > 0,
    (experienceCount.at(0)?.value ?? 0) > 0,
    (skillCount.at(0)?.value ?? 0) >= 3,
  ];

  return Math.round(
    (checks.filter(Boolean).length / checks.length) * 100,
  );
}

export async function ensureCandidateProfile(userId: string): Promise<string> {
  const existing = await db
    .select({ id: candidateProfiles.id })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.userId, userId))
    .limit(1);

  const found = existing.at(0);
  if (found) return found.id;

  const inserted = await db
    .insert(candidateProfiles)
    .values({ userId })
    .returning({ id: candidateProfiles.id });
  return inserted[0]!.id;
}

export type ProfileFormState = FormState;

export { formError, formSuccess };