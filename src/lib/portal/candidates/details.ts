import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  candidateAchievements,
  candidateCertifications,
  candidateEducation,
  candidateExperiences,
  candidateLanguages,
  candidatePreferences,
  candidateProjects,
  candidateSkills,
  type CandidateSkillRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { cleanText, refreshProfileCompletion, sanitizeUrl } from './profile';

/**
 * Candidate profile sub-resources: skills, education, experience, projects,
 * certifications, achievements, languages and job preferences.
 *
 * Every write is scoped to the candidate profile id resolved from the session,
 * and every read verifies ownership, so a guessed record id from another
 * candidate returns "not found" rather than their data (no IDOR).
 *
 * These are NORMALISED tables rather than one JSON blob, so skills can be
 * indexed and matched in SQL by the employer-side candidate search.
 */

/** Lowercases a skill for exact matching, keeping the original for display. */
export function normalizeSkillName(name: string): { name: string; displayName: string } {
  const displayName = cleanText(name, 60);
  if (!displayName) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Skill name is required.');
  }
  return { name: displayName.toLowerCase(), displayName };
}

/** Adds or updates a skill. The unique index prevents duplicates per candidate. */
export async function upsertSkill(
  candidateId: string,
  input: { name: string; proficiency?: string; yearsOfExperience?: number | null }
): Promise<CandidateSkillRow> {
  const { db } = dbFromRequest();
  const { name, displayName } = normalizeSkillName(input.name);

  const [row] = await db
    .insert(candidateSkills)
    .values({
      candidateId,
      name,
      displayName,
      proficiency: input.proficiency ?? 'intermediate',
      yearsOfExperience: input.yearsOfExperience ?? null,
    })
    .onConflictDoUpdate({
      target: [candidateSkills.candidateId, candidateSkills.name],
      set: {
        displayName,
        proficiency: input.proficiency ?? 'intermediate',
        yearsOfExperience: input.yearsOfExperience ?? null,
      },
    })
    .returning();

  await refreshProfileCompletion(candidateId);
  return row;
}

export async function removeSkill(candidateId: string, skillId: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(candidateSkills)
    .where(and(eq(candidateSkills.id, skillId), eq(candidateSkills.candidateId, candidateId)))
    .returning({ id: candidateSkills.id });

  if (removed.length > 0) await refreshProfileCompletion(candidateId);
  return removed.length > 0;
}

export async function listSkills(candidateId: string): Promise<CandidateSkillRow[]> {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(candidateSkills)
    .where(eq(candidateSkills.candidateId, candidateId))
    .orderBy(candidateSkills.name);
}

/* -------------------------------------------------------------------------
 * Generic, owner-scoped CRUD for the remaining profile sub-resources.
 *
 * Each resource is a normalised table with its own columns, so an employer
 * search can filter on real relational data rather than a JSON blob.
 * ---------------------------------------------------------------------- */

/** Education record. */
export async function addEducation(
  candidateId: string,
  input: {
    institution: string;
    degree?: string | null;
    fieldOfStudy?: string | null;
    startYear?: number | null;
    endYear?: number | null;
    grade?: string | null;
    description?: string | null;
  }
) {
  const { db } = dbFromRequest();
  const institution = cleanText(input.institution, 160);
  if (!institution) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Institution is required.');
  }

  const [row] = await db
    .insert(candidateEducation)
    .values({
      candidateId,
      institution,
      degree: cleanText(input.degree, 120),
      fieldOfStudy: cleanText(input.fieldOfStudy, 120),
      startYear: input.startYear ?? null,
      endYear: input.endYear ?? null,
      grade: cleanText(input.grade, 40),
      description: cleanText(input.description, 2000),
    })
    .returning();

  await refreshProfileCompletion(candidateId);
  return row;
}

export async function listEducation(candidateId: string) {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(candidateEducation)
    .where(eq(candidateEducation.candidateId, candidateId))
    .orderBy(desc(candidateEducation.endYear), desc(candidateEducation.createdAt));
}

export async function removeEducation(candidateId: string, id: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(candidateEducation)
    .where(and(eq(candidateEducation.id, id), eq(candidateEducation.candidateId, candidateId)))
    .returning({ id: candidateEducation.id });
  if (removed.length > 0) await refreshProfileCompletion(candidateId);
  return removed.length > 0;
}

/** Work experience record. */
export async function addExperience(
  candidateId: string,
  input: {
    company: string;
    title: string;
    employmentType?: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean;
    description?: string | null;
  }
) {
  const { db } = dbFromRequest();
  const company = cleanText(input.company, 120);
  const title = cleanText(input.title, 120);
  if (!company || !title) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Company and title are required.');
  }

  const [row] = await db
    .insert(candidateExperiences)
    .values({
      candidateId,
      company,
      title,
      employmentType: input.employmentType ?? 'full_time',
      location: cleanText(input.location, 120),
      startDate: input.startDate || null,
      endDate: input.isCurrent ? null : input.endDate || null,
      isCurrent: input.isCurrent ?? false,
      description: cleanText(input.description, 3000),
    })
    .returning();

  await refreshProfileCompletion(candidateId);
  return row;
}

export async function listExperience(candidateId: string) {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(candidateExperiences)
    .where(eq(candidateExperiences.candidateId, candidateId))
    .orderBy(desc(candidateExperiences.isCurrent), desc(candidateExperiences.startDate));
}

export async function removeExperience(candidateId: string, id: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(candidateExperiences)
    .where(and(eq(candidateExperiences.id, id), eq(candidateExperiences.candidateId, candidateId)))
    .returning({ id: candidateExperiences.id });
  if (removed.length > 0) await refreshProfileCompletion(candidateId);
  return removed.length > 0;
}

/** Project record. */
export async function addProject(
  candidateId: string,
  input: {
    name: string;
    description?: string | null;
    url?: string | null;
    technologies?: string[];
    startDate?: string | null;
    endDate?: string | null;
  }
) {
  const { db } = dbFromRequest();
  const name = cleanText(input.name, 120);
  if (!name) throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Project name is required.');

  const [row] = await db
    .insert(candidateProjects)
    .values({
      candidateId,
      name,
      description: cleanText(input.description, 2000),
      url: sanitizeUrl(input.url),
      technologies: (input.technologies ?? []).map((t) => normalizeSkillName(t).name).slice(0, 25),
      startDate: input.startDate || null,
      endDate: input.endDate || null,
    })
    .returning();
  return row;
}

export async function listProjects(candidateId: string) {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(candidateProjects)
    .where(eq(candidateProjects.candidateId, candidateId))
    .orderBy(desc(candidateProjects.createdAt));
}

export async function removeProject(candidateId: string, id: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(candidateProjects)
    .where(and(eq(candidateProjects.id, id), eq(candidateProjects.candidateId, candidateId)))
    .returning({ id: candidateProjects.id });
  return removed.length > 0;
}


/** Certification record. */
export async function addCertification(
  candidateId: string,
  input: {
    name: string;
    issuer?: string | null;
    issuedOn?: string | null;
    expiresOn?: string | null;
    credentialId?: string | null;
    url?: string | null;
  }
) {
  const { db } = dbFromRequest();
  const name = cleanText(input.name, 160);
  if (!name) throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Certification name is required.');

  const [row] = await db
    .insert(candidateCertifications)
    .values({
      candidateId,
      name,
      issuer: cleanText(input.issuer, 120),
      issuedOn: input.issuedOn || null,
      expiresOn: input.expiresOn || null,
      credentialId: cleanText(input.credentialId, 120),
      url: sanitizeUrl(input.url),
    })
    .returning();
  return row;
}

export async function listCertifications(candidateId: string) {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(candidateCertifications)
    .where(eq(candidateCertifications.candidateId, candidateId))
    .orderBy(desc(candidateCertifications.issuedOn));
}

export async function removeCertification(candidateId: string, id: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(candidateCertifications)
    .where(
      and(eq(candidateCertifications.id, id), eq(candidateCertifications.candidateId, candidateId))
    )
    .returning({ id: candidateCertifications.id });
  return removed.length > 0;
}

/** Achievement record. */
export async function addAchievement(
  candidateId: string,
  input: { title: string; description?: string | null; achievedOn?: string | null }
) {
  const { db } = dbFromRequest();
  const title = cleanText(input.title, 160);
  if (!title) throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Achievement title is required.');

  const [row] = await db
    .insert(candidateAchievements)
    .values({
      candidateId,
      title,
      description: cleanText(input.description, 1000),
      achievedOn: input.achievedOn || null,
    })
    .returning();
  return row;
}

export async function listAchievements(candidateId: string) {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(candidateAchievements)
    .where(eq(candidateAchievements.candidateId, candidateId))
    .orderBy(desc(candidateAchievements.achievedOn));
}

export async function removeAchievement(candidateId: string, id: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(candidateAchievements)
    .where(and(eq(candidateAchievements.id, id), eq(candidateAchievements.candidateId, candidateId)))
    .returning({ id: candidateAchievements.id });
  return removed.length > 0;
}

/** Spoken language. Names are stored lowercase for de-duplication. */
export async function upsertLanguage(
  candidateId: string,
  input: { name: string; proficiency?: string }
) {
  const { db } = dbFromRequest();
  const { name, displayName } = normalizeSkillName(input.name);

  const [row] = await db
    .insert(candidateLanguages)
    .values({ candidateId, name, proficiency: input.proficiency ?? 'professional' })
    .onConflictDoUpdate({
      target: [candidateLanguages.candidateId, candidateLanguages.name],
      set: { proficiency: input.proficiency ?? 'professional' },
    })
    .returning();
  return { ...row, displayName };
}

export async function listLanguages(candidateId: string) {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(candidateLanguages)
    .where(eq(candidateLanguages.candidateId, candidateId))
    .orderBy(candidateLanguages.name);
}

export async function removeLanguage(candidateId: string, id: string): Promise<boolean> {
  const { db } = dbFromRequest();
  const removed = await db
    .delete(candidateLanguages)
    .where(and(eq(candidateLanguages.id, id), eq(candidateLanguages.candidateId, candidateId)))
    .returning({ id: candidateLanguages.id });
  return removed.length > 0;
}

/** Job preferences, created on demand so an update never has to branch. */
export async function updatePreferences(
  candidateId: string,
  input: {
    preferredLocations?: string[];
    preferredJobTypes?: string[];
    preferredWorkModes?: string[];
    preferredIndustries?: string[];
    minSalaryMinor?: number | null;
    alertFrequency?: string;
    jobAlertEnabled?: boolean;
  }
) {
  const { db } = dbFromRequest();
  const cleanList = (values: string[] | undefined, max: number): string[] =>
    (values ?? [])
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
      .slice(0, max);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.preferredLocations !== undefined) {
    patch.preferredLocations = cleanList(input.preferredLocations, 20);
  }
  if (input.preferredJobTypes !== undefined) {
    patch.preferredJobTypes = cleanList(input.preferredJobTypes, 10);
  }
  if (input.preferredWorkModes !== undefined) {
    patch.preferredWorkModes = cleanList(input.preferredWorkModes, 10);
  }
  if (input.preferredIndustries !== undefined) {
    patch.preferredIndustries = cleanList(input.preferredIndustries, 20);
  }
  if (input.minSalaryMinor !== undefined) patch.minSalaryMinor = input.minSalaryMinor;
  if (input.alertFrequency !== undefined) {
    if (!['daily', 'weekly'].includes(input.alertFrequency)) {
      throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported alert frequency.');
    }
    patch.alertFrequency = input.alertFrequency;
  }
  if (input.jobAlertEnabled !== undefined) patch.jobAlertEnabled = input.jobAlertEnabled;

  const updated = await db
    .insert(candidatePreferences)
    .values({ candidateId, ...(patch as object) })
    .onConflictDoUpdate({
      target: candidatePreferences.candidateId,
      set: patch,
    })
    .returning();

  return updated[0];
}

export async function getPreferences(candidateId: string) {
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(candidatePreferences)
    .where(eq(candidatePreferences.candidateId, candidateId))
    .limit(1);
  return row ?? null;
}

