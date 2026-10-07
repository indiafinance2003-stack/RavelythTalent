import { describe, expect, it } from "vitest";
import { buildDigestLine, buildSocialCaption, normalizeHashtags, socialJobUrl } from "./content";

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

const base = {
  job,
  companyName: "Acme Technologies",
  appUrl: "https://ravelyth.in",
  platform: "facebook" as const,
  captionTemplate: "{{title}} at {{company}} in {{city}}. {{salary}} {{link}}",
  hashtags: "hiring, jobs india #remote",
};

describe("buildSocialCaption", () => {
  it("renders public job fields, salary and a UTM-tagged link", () => {
    const caption = buildSocialCaption(base);
    expect(caption).toContain("Senior React Developer");
    expect(caption).toContain("Acme Technologies");
    expect(caption).toContain("Bengaluru");
    expect(caption).toContain("Full-time");
    expect(caption).toContain("Hybrid");
    expect(caption).toContain("₹");
    expect(caption).toContain("utm_source=facebook");
    expect(caption).toContain("utm_medium=social");
    expect(caption).toContain("#hiring");
    expect(caption).toContain("#jobs");
    expect(caption).toContain("#remote");
  });

  it("omits the salary entirely when it is hidden", () => {
    const caption = buildSocialCaption({
      ...base,
      job: { ...job, salaryHidden: true },
      captionTemplate: "{{title}} | {{salary}} | {{link}}",
    });
    expect(caption).not.toContain("₹");
    expect(caption).not.toContain("1,800,000");
    expect(caption).not.toContain("2,800,000");
    expect(caption).toContain("Senior React Developer");
  });

  it("never leaks private data - only fields explicitly passed in", () => {
    const caption = buildSocialCaption(base);
    expect(caption).not.toContain("@");
    expect(caption).not.toMatch(/\b\d{10}\b/);
    expect(caption).not.toContain("description");
    expect(caption).not.toContain(job.slug === "leaked" ? "leaked" : "__no_private_marker__");
  });

  it("always carries the job type and work mode, and supports {{location}}", () => {
    const caption = buildSocialCaption({
      ...base,
      captionTemplate: "{{title}} at {{company}} in {{location}}.",
    });
    expect(caption).toContain("Bengaluru, Karnataka");
    expect(caption).toContain("Full-time");
    expect(caption).toContain("Hybrid");
  });

  it("ends Instagram captions with the plain URL and link in bio", () => {
    const caption = buildSocialCaption({ ...base, platform: "instagram" });
    const url = socialJobUrl("https://ravelyth.in", job.slug, "instagram");
    expect(caption.endsWith("Link in bio")).toBe(true);
    expect(caption).toContain(url);
    expect(caption).toContain("utm_source=instagram");
  });

  it("applies the template variables it knows and leaves no unknown tokens", () => {
    const caption = buildSocialCaption({
      ...base,
      captionTemplate: "{{title}} {{company}} {{city}} {{job_type}} {{work_mode}} {{salary}} {{link}} {{bogus}}",
    });
    expect(caption).not.toContain("{{");
    expect(caption).not.toContain("}}");
  });

  it("clamps captions to the platform limit", () => {
    const template = `${"x".repeat(6_000)} {{link}}`;
    const facebook = buildSocialCaption({ ...base, captionTemplate: template });
    expect(facebook.length).toBeLessThanOrEqual(5_000);
    expect(facebook.endsWith("…")).toBe(true);
    const instagram = buildSocialCaption({
      ...base,
      platform: "instagram",
      captionTemplate: template,
    });
    expect(instagram.length).toBeLessThanOrEqual(2_200);
    expect(instagram.endsWith("…")).toBe(true);
  });
});

describe("normalizeHashtags", () => {
  it("deduplicates and prefixes tags", () => {
    expect(normalizeHashtags("hiring, jobs #hiring  india")).toBe("#hiring #jobs #india");
    expect(normalizeHashtags("   ")).toBe("");
  });
});

describe("buildDigestLine (WhatsApp)", () => {
  it("uses only public fields with a plain job link", () => {
    const line = buildDigestLine({
      job,
      companyName: "Acme Technologies",
      appUrl: "https://ravelyth.in",
      index: 1,
    });
    expect(line).toContain("Senior React Developer");
    expect(line).toContain("Acme Technologies");
    expect(line).toContain("Bengaluru");
    expect(line).toContain("https://ravelyth.in/jobs/senior-react-developer-acme");
    expect(line).not.toContain("?");
    expect(line).not.toContain("₹");
    expect(line.startsWith("🟢")).toBe(true);
  });
});
