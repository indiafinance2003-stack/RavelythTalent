import { describe, expect, it } from "vitest";
import {
  candidateVisibilityForCandidate,
  candidateVisibilityForEmployer,
  conversionFreePostsUsed,
  retainedCandidatePremiumExpiry,
  switchBackReason,
} from "./employer-conversion";

describe("candidate/employer conversion policy", () => {
  it("hides but retains the candidate search preference during conversion", () => {
    expect(candidateVisibilityForEmployer(true)).toEqual({
      discoverable: false,
      restoreDiscoverable: true,
    });
    expect(candidateVisibilityForCandidate(true)).toBe(true);
    expect(candidateVisibilityForCandidate(false)).toBe(false);
    expect(candidateVisibilityForCandidate(null)).toBe(false);
  });

  it("grants the conversion free-post allowance at most once per account", () => {
    expect(conversionFreePostsUsed(false, 1)).toBe(0);
    expect(conversionFreePostsUsed(true, 1)).toBe(1);
    expect(conversionFreePostsUsed(true, 0)).toBe(0);
  });

  it("keeps a candidate premium expiry intact while the subscription is active", () => {
    const expiry = new Date("2027-01-01T00:00:00.000Z");
    expect(retainedCandidatePremiumExpiry({
      status: "active",
      companyId: null,
      currentPeriodEnd: expiry,
    }, new Date("2026-10-01T00:00:00.000Z"))).toBe(expiry);
    expect(retainedCandidatePremiumExpiry({
      status: "expired",
      companyId: null,
      currentPeriodEnd: expiry,
    }, new Date("2026-10-01T00:00:00.000Z"))).toBeNull();
    expect(retainedCandidatePremiumExpiry({
      status: "active",
      companyId: "company-id",
      currentPeriodEnd: expiry,
    }, new Date("2026-10-01T00:00:00.000Z"))).toBeNull();
  });

  it("reports the exact job and subscription blockers to switching back", () => {
    expect(switchBackReason({
      liveJobs: 1,
      heldJobs: 2,
      hasActiveEmployerSubscription: true,
    })).toBe(
      "You can't switch back to candidate while the company has 3 live or held jobs (1 live, 2 held) and an active employer subscription.",
    );
    expect(switchBackReason({
      liveJobs: 0,
      heldJobs: 0,
      hasActiveEmployerSubscription: false,
    })).toBeNull();
  });
});
