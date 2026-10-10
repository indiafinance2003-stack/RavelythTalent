import {
  formatSalaryRange,
  formatStipendRange,
  JOB_TYPE_LABEL,
  WORK_MODE_LABEL,
  labelFor,
} from "@/lib/utils";
import type { SocialCaptionJob } from "./content";

/**
 * Pure model behind the public 1080x1080 job card at
 * /api/social/card/[jobId] (Task 9.3). Kept free of rendering code so the
 * card contents can be tested without a browser or a database: only the same
 * public fields shown on the job page ever reach the image, and a hidden
 * salary never appears.
 */

export const SOCIAL_CARD_COLORS = {
  navy: "#0B2A6F",
  royal: "#1F6FEB",
  teal: "#3DB8B0",
  sky: "#DCEBFB",
  offWhite: "#FAFAF8",
} as const;

export const SOCIAL_CARD_BRAND = "Ravelyth Talent";
export const SOCIAL_CARD_CTA = "Apply at ravelyth.in";

export type SocialCardModel = {
  brand: string;
  cta: string;
  title: string;
  company: string;
  location: string;
  chips: string[];
  /** Null whenever the salary is hidden or not set. */
  salary: string | null;
};

export function buildSocialCardModel(
  job: SocialCaptionJob,
  companyName: string,
): SocialCardModel {
  const location = [job.city, job.state].filter(Boolean).join(", ") || "India";
  const isInternship = job.jobType === "internship";
  const showSalary =
    !isInternship &&
    !job.salaryHidden &&
    (Boolean(job.salaryMinPaise) || Boolean(job.salaryMaxPaise));
  const salary = isInternship
    ? formatStipendRange(job.stipendMinPaise, job.stipendMaxPaise, job.stipendType)
    : showSalary
      ? formatSalaryRange(job.salaryMinPaise, job.salaryMaxPaise, job.salaryPeriod, false)
      : null;

  return {
    brand: SOCIAL_CARD_BRAND,
    cta: SOCIAL_CARD_CTA,
    title: job.title,
    company: companyName,
    location,
    chips: [
      location,
      labelFor(WORK_MODE_LABEL, job.workMode, ""),
      labelFor(JOB_TYPE_LABEL, job.jobType, ""),
    ].filter(Boolean),
    salary,
  };
}
