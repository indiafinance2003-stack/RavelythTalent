import { describe, expect, it } from "vitest";
import { matchesSubscribedCompany } from "./lead-subscription-match";

describe("matchesSubscribedCompany", () => {
  it("matches the saved contact email without case sensitivity", () => {
    expect(matchesSubscribedCompany(
      { email: "OWNER@ACME.IN", website: null },
      { contactEmail: "owner@acme.in", website: null, websiteDomain: null },
    )).toBe(true);
  });

  it("matches equivalent company website domains", () => {
    expect(matchesSubscribedCompany(
      { email: "contact@other.in", website: "https://www.acme.in/jobs" },
      { contactEmail: null, website: "acme.in", websiteDomain: "acme.in" },
    )).toBe(true);
  });

  it("does not match missing or different domains", () => {
    expect(matchesSubscribedCompany(
      { email: "contact@other.in", website: null },
      { contactEmail: null, website: null, websiteDomain: "acme.in" },
    )).toBe(false);
  });
});
