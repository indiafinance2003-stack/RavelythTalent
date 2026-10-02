import 'server-only';
import { count, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  candidateEducation,
  candidateExperiences,
  candidatePreferences,
  candidateProfiles,
  candidateSkills,
  resumes,
  type CandidateProfileRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';

/** Aggregate count used by the completion calculation. */
function countRows() {
  return count();
}

/**
 * Candidate profile service.
 *
 * Authorization: every function takes the CANDIDATE PROFILE ID resolved from the
 * server session. Nothing here accepts a user id from a request body, so one
 * candidate can never read or write another candidate's profile.
 *
 * Data minimisation: the profile stores professional job-seeker information
 * only. Date of birth is optional and is never required to register, build a
 * profile, or apply to a job.
 */

export interface ProfileUpdate {
  fullName?: string;
  phone?: string | null;
  location?: string | null;
  dateOfBirth?: string | null;
  headline?: string | null;
  summary?: string | null;
  currentCompany?: string | null;
  currentJobTitle?: string | null;
  totalExperienceYears?: number | null;
  currentCtcMinor?: number | null;
  expectedCtcMinor?: number | null;
  noticePeriodDays?: number | null;
  portfolioUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  profileVisibility?: string;
  openToWork?: boolean;
}

/** Strips control characters and caps length before persisting free text. */
export function cleanText(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, maxLength);
}

/**
 * Accepts only http(s) URLs, so a stored value can never become a
 * `javascript:` link when rendered by the frontend later.
 */
export function sanitizeUrl(value: string | null | undefined): string | null {
  const cleaned = cleanText(value, 300);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Ensures the candidate has a profile, creating a minimal one on first use. */
export async function ensureCandidateProfile(input: {
  userId: string;
  fullName: string;
}): Promise<CandidateProfileRow> {
  const { db } = dbFromRequest();

  const [existing] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.userId, input.userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(candidateProfiles)
    .values({ userId: input.userId, fullName: cleanText(input.fullName, 120) ?? 'Candidate' })
    .returning();

  // Preferences always exist alongside a profile so later updates never need a
  // create-or-update dance.
  await db.insert(candidatePreferences).values({ candidateId: created.id }).onConflictDoNothing();

  return created;
}

/** One profile, always by the caller's own id. */
export async function getCandidateProfile(candidateId: string): Promise<CandidateProfileRow> {
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested profile was not found.', 404);
  return row;
}

/** Updates editable profile fields, then recomputes completion server-side. */
export async function updateCandidateProfile(
  candidateId: string,
  update: ProfileUpdate
): Promise<CandidateProfileRow> {
  const { db } = dbFromRequest();

  // Throws 404 when the caller does not own this profile.
  await getCandidateProfile(candidateId);

  const patch: Partial<typeof candidateProfiles.$inferInsert> = { updatedAt: new Date() };

  if (update.fullName !== undefined) {
    const name = cleanText(update.fullName, 120);
    if (!name) throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Name is required.');
    patch.fullName = name;
  }
  if (update.phone !== undefined) patch.phone = cleanText(update.phone, 32);
  if (update.location !== undefined) patch.location = cleanText(update.location, 120);
  if (update.dateOfBirth !== undefined) patch.dateOfBirth = update.dateOfBirth || null;
  if (update.headline !== undefined) patch.headline = cleanText(update.headline, 160);
  if (update.summary !== undefined) patch.summary = cleanText(update.summary, 4000);
  if (update.currentCompany !== undefined) {
    patch.currentCompany = cleanText(update.currentCompany, 120);
  }
  if (update.currentJobTitle !== undefined) {
    patch.currentJobTitle = cleanText(update.currentJobTitle, 120);
  }
  if (update.totalExperienceYears !== undefined) {
    patch.totalExperienceYears =
      update.totalExperienceYears === null
        ? null
        : Math.max(0, Math.floor(update.totalExperienceYears));
  }
  if (update.currentCtcMinor !== undefined) patch.currentCtcMinor = update.currentCtcMinor;
  if (update.expectedCtcMinor !== undefined) patch.expectedCtcMinor = update.expectedCtcMinor;
  if (update.noticePeriodDays !== undefined) {
    patch.noticePeriodDays =
      update.noticePeriodDays === null ? null : Math.max(0, Math.floor(update.noticePeriodDays));
  }
  if (update.portfolioUrl !== undefined) patch.portfolioUrl = sanitizeUrl(update.portfolioUrl);
  if (update.linkedinUrl !== undefined) patch.linkedinUrl = sanitizeUrl(update.linkedinUrl);
  if (update.githubUrl !== undefined) patch.githubUrl = sanitizeUrl(update.githubUrl);
  if (update.profileVisibility !== undefined) {
    if (!['public', 'employers', 'private'].includes(update.profileVisibility)) {
      throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported profile visibility.');
    }
    patch.profileVisibility = update.profileVisibility;
  }
  if (update.openToWork !== undefined) patch.openToWork = update.openToWork;

  await db.update(candidateProfiles).set(patch).where(eq(candidateProfiles.id, candidateId));

  // Completion is always recomputed, never accepted from the client.
  await refreshProfileCompletion(candidateId);
  return getCandidateProfile(candidateId);
}

export interface ProfileCompletion {
  percentage: number;
  missing: string[];
}

/**
 * Recomputes the profile completion score from real data.
 *
 * The score is derived from actual rows (profile fields, skills, education,
 * experience, a resume), so it cannot be inflated by the client.
 */
export async function refreshProfileCompletion(candidateId: string): Promise<ProfileCompletion> {
  const { db } = dbFromRequest();

  const [profile] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.id, candidateId))
    .limit(1);
  if (!profile) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested profile was not found.', 404);
  }

  const [skillCount] = await db
    .select({ value: countRows() })
    .from(candidateSkills)
    .where(eq(candidateSkills.candidateId, candidateId));

  const [educationCount] = await db
    .select({ value: countRows() })
    .from(candidateEducation)
    .where(eq(candidateEducation.candidateId, candidateId));

  const [experienceCount] = await db
    .select({ value: countRows() })
    .from(candidateExperiences)
    .where(eq(candidateExperiences.candidateId, candidateId));

  const [resumeCount] = await db
    .select({ value: countRows() })
    .from(resumes)
    .where(eq(resumes.candidateId, candidateId));

  const checks: Array<[string, boolean]> = [
    ['headline', Boolean(profile.headline)],
    ['summary', Boolean(profile.summary)],
    ['location', Boolean(profile.location)],
    ['phone', Boolean(profile.phone)],
    ['currentJobTitle', Boolean(profile.currentJobTitle)],
    ['totalExperienceYears', profile.totalExperienceYears !== null],
    ['expectedCtcMinor', profile.expectedCtcMinor !== null],
    ['linkedinUrl', Boolean(profile.linkedinUrl)],
    ['skills', (skillCount?.value ?? 0) > 0],
    ['education', (educationCount?.value ?? 0) > 0],
    ['experience', (experienceCount?.value ?? 0) > 0],
    ['resume', (resumeCount?.value ?? 0) > 0],
  ];

  const completed = checks.filter(([, done]) => done).length;
  const percentage = Math.round((completed / checks.length) * 100);
  const missing = checks.filter(([, done]) => !done).map(([field]) => field);

  await db
    .update(candidateProfiles)
    .set({ profileCompletion: percentage })
    .where(eq(candidateProfiles.id, candidateId));

  return { percentage, missing };
}

/** Current completion snapshot without recomputing. */
export async function getProfileCompletion(candidateId: string): Promise<ProfileCompletion> {
  const profile = await getCandidateProfile(candidateId);
  return { percentage: profile.profileCompletion, missing: [] };
}
