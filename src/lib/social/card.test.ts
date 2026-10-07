import { describe, expect, it } from "vitest";
import {
  buildSocialCardModel,
  SOCIAL_CARD_BRAND,
  SOCIAL_CARD_COLORS,
  SOCIAL_CARD_CTA,
} from "./card";

const job = {
  title: "Senior React Developer",
  slug: "senior-react-developer-acme",
  city: "Bengaluru",
  state: "Karnataka",
  jobType: "full_time",
  workMode: "hybrid",
  salaryMinPaise: 1_800_000_00,
  salaryMaxPaise: 2_800_000_00,
  salaryPeriod: "year",
  salaryHidden: false,
};

describe("job card contents", () => {
  it("uses only the public job fields, the brand and the apply line", () => {
    const model = buildSocialCardModel(job, "Acme Technologies");
    expect(Object.keys(model).sort()).toEqual([
      "brand",
      "chips",
      "company",
      "cta",
      "location",
      "salary",
      "title",
    ]);
    expect(model.brand).toBe("Ravelyth Talent");
    expect(model.cta).toBe("Apply at ravelyth.in");
    expect(model.title).toBe("Senior React Developer");
    expect(model.company).toBe("Acme Technologies");
    expect(model.location).toBe("Bengaluru, Karnataka");
    expect(model.chips).toEqual(["Bengaluru, Karnataka", "Hybrid", "Full-time"]);
    expect(model.salary).toContain("₹");
    expect(JSON.stringify(model)).not.toContain("@");
    expect(JSON.stringify(model)).not.toMatch(/\b\d{10}\b/);
  });

  it("omits a hidden salary completely", () => {
    const model = buildSocialCardModel({ ...job, salaryHidden: true }, "Acme Technologies");
    expect(model.salary).toBeNull();
    expect(JSON.stringify(model)).not.toContain("₹");
    expect(JSON.stringify(model)).not.toContain("18,00,000");
  });

  it("omits a salary that was never entered", () => {
    const model = buildSocialCardModel(
      { ...job, salaryMinPaise: null, salaryMaxPaise: null },
      "Acme Technologies",
    );
    expect(model.salary).toBeNull();
  });

  it("falls back to India when the job has no city or state", () => {
    const model = buildSocialCardModel(
      { ...job, city: null, state: null },
      "Acme Technologies",
    );
    expect(model.location).toBe("India");
    expect(model.chips).toContain("India");
  });

  it("uses the documented brand colours", () => {
    expect(SOCIAL_CARD_COLORS).toEqual({
      navy: "#0B2A6F",
      royal: "#1F6FEB",
      teal: "#3DB8B0",
      sky: "#DCEBFB",
      offWhite: "#FAFAF8",
    });
    expect(SOCIAL_CARD_BRAND).toBe("Ravelyth Talent");
    expect(SOCIAL_CARD_CTA).toBe("Apply at ravelyth.in");
  });
});
