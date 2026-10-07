import type { SocialPlatform } from "@/lib/db/schema";

/**
 * Pure eligibility rules for social auto-posting (Task 9).
 * A job is promoted only when it passed the automatic safety scan with a
 * publish decision, is currently published, has zero open reports, and the
 * company has not opted out - and the switches are on.
 */
export type SocialEligibilityInput = {
  jobStatus: string;
  jobDeleted: boolean;
  scanDecision: "publish" | "hold" | "block";
  openReportCount: number;
  companyOptedOut: boolean;
  masterEnabled: boolean;
  platformEnabled: boolean;
  paused: boolean;
};

export type SocialEligibilityResult = { eligible: boolean; reason: string };

export function socialPostEligibility(input: SocialEligibilityInput): SocialEligibilityResult {
  if (input.paused) return { eligible: false, reason: "posting is paused (kill switch)" };
  if (!input.masterEnabled) return { eligible: false, reason: "auto-posting is disabled" };
  if (!input.platformEnabled) return { eligible: false, reason: "platform is disabled" };
  if (input.jobDeleted) return { eligible: false, reason: "job was deleted" };
  if (input.jobStatus !== "published") return { eligible: false, reason: `job is ${input.jobStatus}` };
  if (input.scanDecision !== "publish") {
    return { eligible: false, reason: `job did not pass the automatic scan (${input.scanDecision})` };
  }
  if (input.openReportCount > 0) return { eligible: false, reason: "job has open reports" };
  if (input.companyOptedOut) {
    return { eligible: false, reason: "company opted out of social promotion" };
  }
  return { eligible: true, reason: "eligible" };
}

/**
 * Public job-card images are only served for jobs that are published right
 * now; every other state maps to a 404 in the card route.
 */
export function socialCardVisible(job: {
  status: string;
  deletedAt: Date | null;
}): boolean {
  return job.status === "published" && !job.deletedAt;
}

/**
 * Platforms to enqueue for a job. Dedupe per job and platform is enforced by
 * the unique index on (job_id, platform); this decides which platforms apply.
 */
export function planEnqueue(input: {
  masterEnabled: boolean;
  paused: boolean;
  facebookEnabled: boolean;
  instagramEnabled: boolean;
  facebookConfigured: boolean;
  instagramConfigured: boolean;
  jobStatus: string;
  jobDeleted: boolean;
  scanDecision: "publish" | "hold" | "block";
  openReportCount: number;
  companyOptedOut: boolean;
}): { platforms: SocialPlatform[]; reason: string } {
  const platforms: SocialPlatform[] = [];
  const reasons: string[] = [];
  const targets: Array<{ platform: SocialPlatform; enabled: boolean; configured: boolean }> = [
    { platform: "facebook", enabled: input.facebookEnabled, configured: input.facebookConfigured },
    { platform: "instagram", enabled: input.instagramEnabled, configured: input.instagramConfigured },
  ];
  for (const target of targets) {
    const shared = socialPostEligibility({
      jobStatus: input.jobStatus,
      jobDeleted: input.jobDeleted,
      scanDecision: input.scanDecision,
      openReportCount: input.openReportCount,
      companyOptedOut: input.companyOptedOut,
      masterEnabled: input.masterEnabled,
      platformEnabled: target.enabled,
      paused: input.paused,
    });
    if (!shared.eligible) {
      reasons.push(`${target.platform}: ${shared.reason}`);
      continue;
    }
    if (!target.configured) {
      reasons.push(`${target.platform}: not configured`);
      continue;
    }
    platforms.push(target.platform);
  }
  if (platforms.length === 0) return { platforms, reason: reasons.join("; ") || "nothing to enqueue" };
  return { platforms, reason: "ok" };
}
