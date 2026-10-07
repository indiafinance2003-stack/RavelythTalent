import { describe, expect, it } from "vitest";
import {
  computeJobMatch,
  hasEnoughMatchData,
  MATCH_WEIGHTS,
  normalizeKey,
  type MatchJob,
  type MatchProfile,
} from "@/lib/jobs/match";

const profile: MatchProfile = {
  skills: ["react", "node", "sql"],
  location: "Bengaluru",
  preferredLocations: ["Remote"],
  experienceMonths: 36,
};

const perfectJob: MatchJob = {
  city: "Bengaluru",
  state: "Karnataka",
  workMode: "hybrid",
  skills: ["React", "Node", "SQL"],
  experienceMinYears: 2,
  experienceMaxYears: 5,
};

describe("normalizeKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeKey("  React  ")).toBe("react");
    expect(normalizeKey("JAVA   SCRIPT")).toBe("java script");
  });
});

describe("computeJobMatch", () => {
  it("scores a perfect fit at 100", () => {
    const result = computeJobMatch(perfectJob, profile);
    expect(result.score).toBe(100);
    expect(result.skillsMatched).toBe(3);
    expect(result.skillsRequired).toBe(3);
    expect(result.locationMatched).toBe(true);
    expect(result.experienceFits).toBe(true);
  });

  it("scores no overlap at 0", () => {
    const result = computeJobMatch(
      {
        city: "Delhi",
        state: "Delhi",
        workMode: "onsite",
        skills: ["cobol", "mainframe"],
        experienceMinYears: 5,
        experienceMaxYears: 8,
      },
      profile,
    );
    expect(result.score).toBe(0);
    expect(result.locationMatched).toBe(false);
    expect(result.experienceFits).toBe(false);
  });

  it("gives partial credit for a remote job with no listed skills", () => {
    const result = computeJobMatch(
      {
        city: null,
        state: null,
        workMode: "remote",
        skills: [],
        experienceMinYears: null,
        experienceMaxYears: null,
      },
      profile,
    );
    expect(result.score).toBe(
      MATCH_WEIGHTS.skills / 2 + Math.round(MATCH_WEIGHTS.location * 0.8) + MATCH_WEIGHTS.experience / 2,
    );
    expect(result.locationMatched).toBe(true);
  });

  it("weights partial skill overlap proportionally", () => {
    const result = computeJobMatch(
      { ...perfectJob, skills: ["React", "cobol"] },
      profile,
    );
    expect(result.skillsMatched).toBe(1);
    expect(result.score).toBe(
      Math.round((1 / 2) * MATCH_WEIGHTS.skills) +
        MATCH_WEIGHTS.location +
        MATCH_WEIGHTS.experience,
    );
  });

  it("keeps experience within tolerance when the candidate is one year short", () => {
    const result = computeJobMatch(
      { ...perfectJob, experienceMinYears: 5, experienceMaxYears: null },
      { ...profile, experienceMonths: 48 },
    );
    expect(result.experienceFits).toBe(false);
    expect(result.score).toBe(
      MATCH_WEIGHTS.skills + MATCH_WEIGHTS.location + MATCH_WEIGHTS.experience / 2,
    );
  });

  it("is deterministic", () => {
    const first = computeJobMatch(perfectJob, profile);
    const second = computeJobMatch(perfectJob, profile);
    expect(first).toEqual(second);
  });

  it("handles a missing profile without throwing", () => {
    const result = computeJobMatch(perfectJob, null);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.skillsMatched).toBe(0);
  });
});

describe("hasEnoughMatchData", () => {
  const empty: MatchProfile = {
    skills: [],
    location: null,
    preferredLocations: [],
    experienceMonths: null,
  };

  it("rejects a missing or empty profile", () => {
    expect(hasEnoughMatchData(null)).toBe(false);
    expect(hasEnoughMatchData(empty)).toBe(false);
  });

  it("accepts a profile with any single signal", () => {
    expect(hasEnoughMatchData({ ...empty, skills: ["react"] })).toBe(true);
    expect(hasEnoughMatchData({ ...empty, location: "Pune" })).toBe(true);
    expect(hasEnoughMatchData({ ...empty, preferredLocations: ["Remote"] })).toBe(
      true,
    );
    expect(hasEnoughMatchData({ ...empty, experienceMonths: 0 })).toBe(true);
  });
});
