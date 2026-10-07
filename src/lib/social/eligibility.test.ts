import { describe, expect, it } from "vitest";
import { planEnqueue, socialCardVisible, socialPostEligibility } from "./eligibility";

const base = {
  jobStatus: "published",
  jobDeleted: false,
  scanDecision: "publish" as const,
  openReportCount: 0,
  companyOptedOut: false,
  masterEnabled: true,
  platformEnabled: true,
  paused: false,
};

describe("social post eligibility", () => {
  it("allows a published, clean, opted-in job with switches on", () => {
    expect(socialPostEligibility(base)).toEqual({ eligible: true, reason: "eligible" });
  });

  it.each([
    ["draft", "draft"],
    ["pending_approval", "pending_approval"],
    ["rejected", "rejected"],
    ["paused", "paused"],
    ["closed", "closed"],
    ["expired", "expired"],
  ])("rejects a job in the %s state", (_label, jobStatus) => {
    expect(socialPostEligibility({ ...base, jobStatus }).eligible).toBe(false);
  });

  it("rejects deleted jobs, held/blocked scans, open reports and opted-out companies", () => {
    expect(socialPostEligibility({ ...base, jobDeleted: true }).eligible).toBe(false);
    expect(socialPostEligibility({ ...base, scanDecision: "hold" }).eligible).toBe(false);
    expect(socialPostEligibility({ ...base, scanDecision: "block" }).eligible).toBe(false);
    expect(socialPostEligibility({ ...base, openReportCount: 2 }).eligible).toBe(false);
    const optOut = socialPostEligibility({ ...base, companyOptedOut: true });
    expect(optOut).toEqual({ eligible: false, reason: "company opted out of social promotion" });
  });

  it("respects the kill switch, master switch and platform switch", () => {
    expect(socialPostEligibility({ ...base, paused: true }).reason).toContain("kill switch");
    expect(socialPostEligibility({ ...base, masterEnabled: false }).eligible).toBe(false);
    expect(socialPostEligibility({ ...base, platformEnabled: false }).eligible).toBe(false);
  });
});

describe("planEnqueue (dedupe inputs per job and platform)", () => {
  const planBase = {
    masterEnabled: true,
    paused: false,
    facebookEnabled: true,
    instagramEnabled: true,
    facebookConfigured: true,
    instagramConfigured: true,
    jobStatus: "published",
    jobDeleted: false,
    scanDecision: "publish" as const,
    openReportCount: 0,
    companyOptedOut: false,
  };

  it("targets both configured, enabled platforms for a clean job", () => {
    expect(planEnqueue(planBase).platforms).toEqual(["facebook", "instagram"]);
  });

  it("excludes unconfigured and disabled platforms individually", () => {
    expect(planEnqueue({ ...planBase, instagramConfigured: false }).platforms).toEqual([
      "facebook",
    ]);
    expect(planEnqueue({ ...planBase, facebookEnabled: false }).platforms).toEqual([
      "instagram",
    ]);
  });

  it("never targets a reported, opted-out or unpublished job", () => {
    expect(planEnqueue({ ...planBase, openReportCount: 1 }).platforms).toEqual([]);
    expect(planEnqueue({ ...planBase, companyOptedOut: true }).platforms).toEqual([]);
    expect(planEnqueue({ ...planBase, jobStatus: "paused" }).platforms).toEqual([]);
    expect(planEnqueue({ ...planBase, masterEnabled: false }).platforms).toEqual([]);
    expect(planEnqueue({ ...planBase, paused: true }).platforms).toEqual([]);
  });
});

describe("public job card visibility (404 rules)", () => {
  it("serves only currently published, non-deleted jobs", () => {
    expect(socialCardVisible({ status: "published", deletedAt: null })).toBe(true);
    expect(socialCardVisible({ status: "draft", deletedAt: null })).toBe(false);
    expect(socialCardVisible({ status: "pending_approval", deletedAt: null })).toBe(false);
    expect(socialCardVisible({ status: "paused", deletedAt: null })).toBe(false);
    expect(socialCardVisible({ status: "closed", deletedAt: null })).toBe(false);
    expect(socialCardVisible({ status: "expired", deletedAt: null })).toBe(false);
    expect(socialCardVisible({ status: "rejected", deletedAt: null })).toBe(false);
    expect(
      socialCardVisible({ status: "published", deletedAt: new Date("2026-10-07T00:00:00Z") }),
    ).toBe(false);
  });
});
