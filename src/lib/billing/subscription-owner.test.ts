import { describe, expect, it } from "vitest";
import { resolveSubscriptionCompanyId } from "./subscription-owner";

describe("subscription purchase ownership", () => {
  it("keeps candidate subscriptions owned by the candidate user", () => {
    expect(resolveSubscriptionCompanyId({
      audience: "candidate",
      userRole: "job_seeker",
    })).toBeNull();
  });

  it("requires a recruiter-owned company for employer plans", () => {
    expect(resolveSubscriptionCompanyId({
      audience: "employer",
      userRole: "recruiter",
      requestedCompanyId: "company-1",
    })).toBe("company-1");
  });

  it("rejects a candidate plan attached to a company", () => {
    expect(() => resolveSubscriptionCompanyId({
      audience: "candidate",
      userRole: "job_seeker",
      requestedCompanyId: "company-1",
    })).toThrow("This candidate plan must be purchased by a candidate account.");
  });
});
