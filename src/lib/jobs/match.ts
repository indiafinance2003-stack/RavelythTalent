/**
 * Deterministic job-match scoring for the candidate dashboard.
 *
 * Pure functions only: given a profile and a job, the same inputs always
 * produce the same 0-100 score, so the number on the dashboard can be
 * explained and reproduced. Weights and thresholds are documented in
 * ASSUMPTIONS.md.
 */

export const MATCH_WEIGHTS = {
  /** Skill overlap with the job's listed skills. */
  skills: 50,
  /** Location compatibility (preferred city, remote, or state). */
  location: 30,
  /** Experience range fit. */
  experience: 20,
} as const;

export type MatchProfile = {
  /** Candidate skills (matched case-insensitively). */
  skills: string[];
  location: string | null;
  preferredLocations: string[];
  experienceMonths: number | null;
};

export type MatchJob = {
  city: string | null;
  state: string | null;
  workMode: string;
  /** Job skills (matched case-insensitively). */
  skills: string[];
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
};

export type MatchResult = {
  score: number;
  skillsMatched: number;
  skillsRequired: number;
  /** Full location compatibility (preferred city or remote). */
  locationMatched: boolean;
  experienceFits: boolean;
};

/** Case/whitespace-insensitive key used for skills and locations (" React.js " -> "react.js"). */
export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Whether the profile carries at least one signal the scorer can use.
 * Recommendations (and their Match chips) are hidden until this is true so a
 * near-empty profile never shows made-up-looking scores.
 */
export function hasEnoughMatchData(profile: MatchProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.skills.length > 0 ||
    Boolean(profile.location) ||
    profile.preferredLocations.length > 0 ||
    profile.experienceMonths !== null
  );
}

export function computeJobMatch(
  job: MatchJob,
  profile: MatchProfile | null,
): MatchResult {
  const skills = scoreSkills(job.skills, profile?.skills ?? []);
  const location = scoreLocation(job, profile ?? null);
  const experience = scoreExperience(job, profile?.experienceMonths ?? null);

  return {
    score: clamp(skills.points + location.points + experience.points),
    skillsMatched: skills.matched,
    skillsRequired: job.skills.length,
    locationMatched: location.full,
    experienceFits: experience.fits,
  };
}

function scoreSkills(
  jobSkills: string[],
  profileSkills: string[],
): { points: number; matched: number } {
  const owned = new Set(profileSkills.map(normalizeKey));
  const matched = jobSkills.filter((skill) => owned.has(normalizeKey(skill))).length;

  if (jobSkills.length === 0) {
    // The job lists no skills: candidates with skills still get partial credit.
    return { points: profileSkills.length > 0 ? MATCH_WEIGHTS.skills / 2 : 0, matched: 0 };
  }
  return {
    points: Math.round((matched / jobSkills.length) * MATCH_WEIGHTS.skills),
    matched,
  };
}

function scoreLocation(
  job: MatchJob,
  profile: MatchProfile | null,
): { points: number; full: boolean } {
  const weight = MATCH_WEIGHTS.location;
  const wanted = [
    profile?.location ?? "",
    ...(profile?.preferredLocations ?? []),
  ]
    .map((value) => normalizeKey(value))
    .filter(Boolean);

  const city = job.city ? normalizeKey(job.city) : "";
  const state = job.state ? normalizeKey(job.state) : "";

  if (city && wanted.includes(city)) return { points: weight, full: true };
  if (job.workMode === "remote") return { points: Math.round(weight * 0.8), full: true };
  if (state && wanted.includes(state)) return { points: Math.round(weight * 0.6), full: false };
  return { points: 0, full: false };
}

function scoreExperience(
  job: MatchJob,
  experienceMonths: number | null,
): { points: number; fits: boolean } {
  const weight = MATCH_WEIGHTS.experience;
  const years = experienceMonths === null ? null : experienceMonths / 12;
  const { experienceMinYears: min, experienceMaxYears: max } = job;

  if (min === null && max === null) return { points: weight / 2, fits: true };
  if (years === null) return { points: weight / 2, fits: false };

  if (min !== null && years < min) {
    const shortfall = min - years;
    return { points: shortfall >= 2 ? 0 : weight / 2, fits: false };
  }
  if (max !== null && years > max) return { points: Math.round(weight * 0.6), fits: false };
  return { points: weight, fits: true };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
