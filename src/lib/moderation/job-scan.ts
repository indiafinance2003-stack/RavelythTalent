import {
  JOB_SCAN_LINK_LIMIT,
  JOB_SCAN_MIN_WORDS,
  JOB_SCAN_SUSPICIOUS_ANNUAL_PAise,
  JOB_SCAN_TEXT_RULES,
  JOB_SCAN_THRESHOLDS,
} from "./job-scan-rules";

export type JobScanInput = {
  title: string;
  description: string;
  responsibilities?: string | null;
  requirements?: string | null;
  salaryMinPaise?: number | null;
  salaryMaxPaise?: number | null;
  salaryPeriod?: "year" | "month" | "day" | "hour" | string;
  experienceMinYears?: number | string | null;
  experienceMaxYears?: number | string | null;
  duplicateByCompany?: boolean;
};

export type JobScanResult = {
  score: number;
  decision: "publish" | "hold" | "block";
  reasons: string[];
};

function allText(job: JobScanInput): string {
  return [job.title, job.description, job.responsibilities, job.requirements]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

function annualizedPaise(job: JobScanInput): number | null {
  const amount = job.salaryMaxPaise ?? job.salaryMinPaise;
  if (amount === null || amount === undefined) return null;
  switch (job.salaryPeriod) {
    case "month":
      return amount * 12;
    case "day":
      return amount * 260;
    case "hour":
      return amount * 2080;
    default:
      return amount;
  }
}

function isAllCapsSpam(text: string, title: string): boolean {
  const letters = text.match(/[A-Za-z]/g) ?? [];
  const uppercase = text.match(/[A-Z]/g) ?? [];
  const titleLetters = title.match(/[A-Za-z]/g) ?? [];
  const titleUppercase = title.match(/[A-Z]/g) ?? [];
  const ratio = letters.length ? uppercase.length / letters.length : 0;
  const titleRatio = titleLetters.length ? titleUppercase.length / titleLetters.length : 0;
  return (
    (letters.length >= 80 && ratio >= 0.65) ||
    (titleLetters.length >= 12 && titleRatio >= 0.85) ||
    /!{4,}|\b(?:URGENT|APPLY NOW)\b.{0,10}\b(?:URGENT|APPLY NOW)\b/.test(text)
  );
}

function hasRepeatedParagraph(text: string): boolean {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 40);
  return new Set(paragraphs).size !== paragraphs.length;
}

export function scanJob(job: JobScanInput): JobScanResult {
  const text = allText(job);
  const reasons: string[] = [];
  let score = 0;
  let hardBlock = false;
  let nonContactFlag = false;

  for (const rule of JOB_SCAN_TEXT_RULES) {
    if (rule.id === "personal-contact") continue;
    if (!rule.pattern.test(text)) continue;
    nonContactFlag = true;
    score += rule.score;
    reasons.push(rule.reason);
    if (rule.decision === "block") hardBlock = true;
  }

  if (job.duplicateByCompany) {
    score += 70;
    hardBlock = true;
    nonContactFlag = true;
    reasons.push("A substantially identical job post already exists for this company.");
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < JOB_SCAN_MIN_WORDS) {
    score += 40;
    nonContactFlag = true;
    reasons.push(`The job description is very short (${wordCount} words; provide at least ${JOB_SCAN_MIN_WORDS}).`);
  }

  // Count URLs once each, including fully-qualified www links.
  const linkCount = (text.match(/\b(?:https?:\/\/|www\.)[^\s)]+/gi) ?? []).length;
  if (linkCount > JOB_SCAN_LINK_LIMIT) {
    score += 35;
    nonContactFlag = true;
    reasons.push(`The post contains too many links (${linkCount}; maximum ${JOB_SCAN_LINK_LIMIT}).`);
  }

  // Repeated substantial paragraphs are a copy/paste or spam signal.
  if (hasRepeatedParagraph(job.description)) {
    score += 45;
    nonContactFlag = true;
    reasons.push("The description repeats a substantial paragraph and may be copied or spam.");
  }

  if (isAllCapsSpam(text, job.title)) {
    score += 35;
    nonContactFlag = true;
    reasons.push("The post uses excessive ALL-CAPS or repeated urgent language.");
  }

  // Normalize pay periods before comparing compensation to experience.
  const annualSalary = annualizedPaise(job);
  const experience = Number(job.experienceMinYears ?? 0);
  if (
    annualSalary !== null &&
    annualSalary > JOB_SCAN_SUSPICIOUS_ANNUAL_PAise &&
    experience < 3
  ) {
    score += 45;
    nonContactFlag = true;
    reasons.push("The advertised salary is unusually high for the stated experience.");
  }

  const personalContactRule = JOB_SCAN_TEXT_RULES.find(
    (rule) => rule.id === "personal-contact",
  );
  if (nonContactFlag && personalContactRule?.pattern.test(text)) {
    score += personalContactRule.score;
    reasons.push(personalContactRule.reason);
  }

  score = Math.min(100, score);
  const decision = hardBlock || score >= JOB_SCAN_THRESHOLDS.holdBelow
    ? "block"
    : score >= JOB_SCAN_THRESHOLDS.publishBelow
      ? "hold"
      : "publish";

  return { score, decision, reasons };
}

export function resolveJobScanDecision(
  scan: JobScanResult,
  autoPublishJobs: boolean,
): { status: "published" | "pending_approval" | "rejected"; reasons: string[] } {
  if (scan.decision === "block") {
    return { status: "rejected", reasons: scan.reasons };
  }
  if (scan.decision === "hold") {
    return { status: "pending_approval", reasons: scan.reasons };
  }
  if (!autoPublishJobs) {
    return {
      status: "pending_approval",
      reasons: ["Automatic publishing is disabled; this job is awaiting administrator review."],
    };
  }
  return { status: "published", reasons: [] };
}
