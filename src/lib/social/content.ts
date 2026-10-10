import type { SocialPlatform } from "@/lib/db/schema";
import {
  formatSalaryRange,
  formatStipendRange,
  JOB_TYPE_LABEL,
  WORK_MODE_LABEL,
  labelFor,
} from "@/lib/utils";

/**
 * Caption building for social auto-posting (Task 9.3/9.4).
 *
 * Only public job data is ever used: title, company name, city, job type,
 * work mode and the salary range when it is not hidden - plus the public job
 * URL with UTM parameters. Never candidate data, employer private contact
 * details, or anything not shown on the public job page.
 */

export type SocialCaptionJob = {
  title: string;
  slug: string;
  city: string | null;
  state: string | null;
  jobType: string;
  workMode: string;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  salaryPeriod: string;
  salaryHidden: boolean;
  stipendType?: string | null;
  stipendMinPaise?: number | null;
  stipendMaxPaise?: number | null;
};

export type SocialCaptionInput = {
  job: SocialCaptionJob;
  companyName: string;
  appUrl: string;
  platform: SocialPlatform;
  captionTemplate: string;
  hashtags: string;
};

/** Public job URL with UTM parameters for attribution. */
export function socialJobUrl(appUrl: string, slug: string, platform: SocialPlatform): string {
  const base = appUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    utm_source: platform,
    utm_medium: "social",
    utm_campaign: "job_posting",
    utm_content: slug,
  });
  return `${base}/jobs/${slug}?${params.toString()}`;
}

/** Hashtag string "#a #b" from a free-form "a, b #c" list; empty when none. */
export function normalizeHashtags(raw: string): string {
  const tags = raw
    .split(/[\s,]+/)
    .map((token) => token.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((token) => `#${token}`);
  return [...new Set(tags)].join(" ");
}

/**
 * Render the configured caption template. Supported variables:
 * {{title}}, {{company}}, {{city}}, {{location}}, {{job_type}}, {{work_mode}},
 * {{salary}}, {{link}}. Unknown tokens are stripped so they can never reach a
 * public post, and the job type and work mode are always part of the text.
 * The rendered caption is trimmed and clamped to the platform length limit.
 */
export function buildSocialCaption(input: SocialCaptionInput): string {
  const { job } = input;
  const location = [job.city, job.state].filter(Boolean).join(", ");
  const isInternship = job.jobType === "internship";
  const showSalary =
    !isInternship &&
    !job.salaryHidden &&
    (Boolean(job.salaryMinPaise) || Boolean(job.salaryMaxPaise));
  const salary = isInternship
    ? formatStipendRange(job.stipendMinPaise, job.stipendMaxPaise, job.stipendType)
    : showSalary
      ? formatSalaryRange(job.salaryMinPaise, job.salaryMaxPaise, job.salaryPeriod, false)
      : "";
  const link = socialJobUrl(input.appUrl, job.slug, input.platform);
  const jobType = labelFor(JOB_TYPE_LABEL, job.jobType, "");
  const workMode = labelFor(WORK_MODE_LABEL, job.workMode, "");

  const replacements: Record<string, string> = {
    "{{title}}": job.title,
    "{{company}}": input.companyName,
    "{{city}}": job.city ?? "",
    "{{location}}": location,
    "{{job_type}}": jobType,
    "{{work_mode}}": workMode,
    "{{salary}}": salary,
    "{{link}}": link,
  };

  let caption = input.captionTemplate;
  for (const [token, value] of Object.entries(replacements)) {
    caption = caption.split(token).join(value);
  }
  caption = caption
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Job type and work mode belong in every post, template or not.
  const missing = [jobType, workMode].filter((value) => value && !caption.includes(value));
  if (missing.length) caption = `${caption} · ${missing.join(" · ")}`;

  const tags = normalizeHashtags(input.hashtags);

  // Instagram captions cannot hold clickable links: keep the caption text
  // link-free there, then end with the plain URL and "link in bio" as the
  // very last line (hashtags come before it).
  if (input.platform === "instagram") {
    caption = caption
      .split(link)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    caption = [caption, tags, link, "Link in bio"].filter(Boolean).join("\n\n");
  } else if (tags) {
    caption = `${caption}\n\n${tags}`;
  }

  const limit = input.platform === "instagram" ? 2_200 : 5_000;
  if (caption.length > limit) caption = `${caption.slice(0, limit - 1).trimEnd()}…`;
  return caption;
}

/**
 * Plain-text bullet body for the manual WhatsApp digest (no automation).
 * Built only from public job fields; the link is the plain public job URL.
 */
export function buildDigestLine(input: {
  job: SocialCaptionJob;
  companyName: string;
  appUrl: string;
  index: number;
}): string {
  const location = [input.job.city, input.job.state].filter(Boolean).join(", ");
  const link = socialJobUrl(input.appUrl, input.job.slug, "facebook").split("?")[0];
  const headline = [`${input.index}. ${input.job.title}`, input.companyName, location]
    .filter(Boolean)
    .join(" · ");
  return `🟢 ${headline}\n${link}`;
}
