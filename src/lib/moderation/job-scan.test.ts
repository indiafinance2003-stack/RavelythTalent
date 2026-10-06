import { describe, expect, it } from "vitest";
import { resolveJobScanDecision, scanJob } from "./job-scan";
import { JOB_SCAN_THRESHOLDS } from "./job-scan-rules";

const cleanJob = {
  title: "Senior operations analyst",
  description:
    "We are looking for a senior operations analyst to improve reporting and daily workflows. You will partner with product and customer teams, document recurring processes, and use clear data to recommend practical improvements. The role works closely with managers across the business and supports measurable service quality goals. Applicants should communicate clearly, work independently, and share examples of process improvements they have delivered.",
};

describe("rule-based job safety scan", () => {
  it("publishes a detailed, ordinary job below the publish threshold", () => {
    const result = scanJob(cleanJob);
    expect(result.score).toBeLessThan(JOB_SCAN_THRESHOLDS.publishBelow);
    expect(result.decision).toBe("publish");
    expect(result.reasons).toEqual([]);
  });

  it.each([
    ["candidate payment", "Pay a registration fee before applying.", "candidate-payment"],
    ["earnings from home", "Earn ₹5000 per day from home with flexible tasks.", "earn-per-day-from-home"],
    ["MLM", "Join our MLM downline and build your network to earn.", "mlm"],
    ["crypto investment", "This investment opportunity offers guaranteed returns in crypto.", "crypto-investment"],
    ["adult content", "We are hiring for escort services and adult entertainment model work.", "adult-content"],
    ["discrimination", "Male candidates only; women should not apply.", "discriminatory-wording"],
  ])("detects %s wording", (_name, phrase, ruleId) => {
    const result = scanJob({ ...cleanJob, description: `${cleanJob.description} ${phrase}` });
    expect(result.reasons.join(" ")).toBeTruthy();
    expect(result.decision === "block" || result.decision === "hold").toBe(true);
    expect(result.reasons[0]).toContain(
      ruleId === "candidate-payment" ? "ask candidates" :
        ruleId === "earn-per-day-from-home" ? "daily-earnings" :
        ruleId === "mlm" ? "multi-level marketing" :
        ruleId === "crypto-investment" ? "cryptocurrency" :
        ruleId === "adult-content" ? "adult or sexually explicit" :
        "discriminate",
    );
  });

  it("holds personal messaging contact only when another risk signal is present", () => {
    const onlyContact = scanJob({
      ...cleanJob,
      description: `${cleanJob.description} Contact our recruiter through WhatsApp.`,
    });
    const combined = scanJob({
      ...cleanJob,
      description: `${cleanJob.description} Join our MLM downline and contact us only through WhatsApp.`,
    });
    expect(onlyContact.decision).toBe("publish");
    expect(combined.decision).toBe("hold");
    expect(combined.reasons.some((reason) => reason.includes("personal messaging"))).toBe(true);
  });

  it("holds very short descriptions", () => {
    const result = scanJob({ title: "Analyst", description: "We need an analyst." });
    expect(result.decision).toBe("hold");
    expect(result.reasons[0]).toContain("very short");
  });

  it("holds copy-pasted paragraphs and excessive links", () => {
    const paragraph = "Apply today to join our team and help us deliver dependable customer service.";
    const repeated = scanJob({ ...cleanJob, description: `${paragraph}\n\n${paragraph}` });
    const linked = scanJob({
      ...cleanJob,
      description: `${cleanJob.description} https://a.test https://b.test https://c.test https://d.test https://e.test https://f.test`,
    });
    expect(repeated.reasons.some((reason) => reason.includes("repeats"))).toBe(true);
    expect(linked.reasons.some((reason) => reason.includes("too many links"))).toBe(true);
    expect(repeated.decision).toBe("block");
    expect(linked.decision).toBe("hold");
  });

  it("holds ALL-CAPS spam and implausible salary for low experience", () => {
    const loud = scanJob({
      ...cleanJob,
      title: "URGENT IMMEDIATE HIRING FOR EVERYONE",
      description: cleanJob.description.toUpperCase(),
    });
    const salary = scanJob({
      ...cleanJob,
      salaryMaxPaise: 12_000_000_000,
      salaryPeriod: "year",
      experienceMinYears: 0,
    });
    expect(loud.reasons.some((reason) => reason.includes("ALL-CAPS"))).toBe(true);
    expect(salary.reasons.some((reason) => reason.includes("salary is unusually high"))).toBe(true);
    expect(loud.decision).toBe("hold");
    expect(salary.decision).toBe("hold");
  });

  it("blocks duplicate postings from the same company", () => {
    const result = scanJob({ ...cleanJob, duplicateByCompany: true });
    expect(result.decision).toBe("block");
    expect(result.reasons.at(-1)).toContain("identical job post");
  });

  it("routes publish, hold and block decisions, honoring the manual-review setting", () => {
    const clean = scanJob(cleanJob);
    const held = scanJob({ ...cleanJob, description: "This is too short." });
    const blocked = scanJob({
      ...cleanJob,
      description: `${cleanJob.description} Pay a processing fee before applying.`,
    });

    expect(resolveJobScanDecision(clean, true).status).toBe("published");
    expect(resolveJobScanDecision(clean, false).status).toBe("pending_approval");
    expect(resolveJobScanDecision(held, true).status).toBe("pending_approval");
    expect(resolveJobScanDecision(blocked, true).status).toBe("rejected");
  });
});
