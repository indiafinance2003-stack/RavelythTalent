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

export type CompletenessCheck = {
  key: string;
  label: string;
  done: boolean;
  /** Where the candidate can fix what is missing. */
  href: string;
};

/**
 * Profile completeness is recomputed server-side from real data so the meter
 * can never drift from what recruiters actually see. Returns both the percent
 * and each individual check so the dashboard can show what is still missing.
 */
export async function getCompleteness(
  userId: string,
): Promise<{ percent: number; checks: CompletenessCheck[] }> {
  const profile = (
    await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, userId))
      .limit(1)
  ).at(0);

  const profileId = profile?.id;
  if (!profileId) {
    return {
      percent: 0,
      checks: [{ key: "profile", label: "Create your profile", done: false, href: "/dashboard/profile" }],
    };
  }

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

  const checks: CompletenessCheck[] = [
    {
      key: "headline",
      label: "Add a headline",
      done: Boolean(profile?.headline?.trim()),
      href: "/dashboard/profile",
    },
    {
      key: "summary",
      label: "Write a summary",
      done: Boolean(profile?.summary?.trim()),
      href: "/dashboard/profile",
    },
    {
      key: "location",
      label: "Set your current location",
      done: Boolean(profile?.currentLocation?.trim()),
      href: "/dashboard/profile",
    },
    {
      key: "designation",
      label: "Add your current designation",
      done: Boolean(profile?.currentDesignation?.trim()),
      href: "/dashboard/profile",
    },
    {
      key: "company",
      label: "Add your current company",
      done: Boolean(profile?.currentCompany?.trim()),
      href: "/dashboard/profile",
    },
    {
      key: "experienceMonths",
      label: "Add total experience",
      done: Boolean(profile?.totalExperienceMonths),
      href: "/dashboard/profile",
    },
    {
      key: "resume",
      label: "Upload a resume",
      done: (resumeCount.at(0)?.value ?? 0) > 0,
      href: "/dashboard/resumes",
    },
    {
      key: "education",
      label: "Add education",
      done: (educationCount.at(0)?.value ?? 0) > 0,
      href: "/dashboard/profile",
    },
    {
      key: "workExperience",
      label: "Add work experience",
      done: (experienceCount.at(0)?.value ?? 0) > 0,
      href: "/dashboard/profile",
    },
    {
      key: "skills",
      label: "Add at least 3 skills",
      done: (skillCount.at(0)?.value ?? 0) >= 3,
      href: "/dashboard/profile",
    },
  ];

  const percent = Math.round(
    (checks.filter((check) => check.done).length / checks.length) * 100,
  );
  return { percent, checks };
}

export async function computeCompleteness(userId: string): Promise<number> {
  return (await getCompleteness(userId)).percent;
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