import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobReports, jobs, socialPosts } from "@/lib/db/schema";
import { scanJob } from "@/lib/moderation/job-scan";
import { appUrl } from "@/lib/email/urls";
import { getSocialSettings } from "./settings";
import { socialPostEligibility } from "./eligibility";
import { buildSocialCaption } from "./content";
import { getSocialProvider, SocialApiError } from "./providers";
import type { SocialPlatform } from "@/lib/db/schema";

export type PostNowResult =
  | { ok: true; platformPostId: string }
  | { ok: false; reason: string };

/**
 * Per-job "post now" action from the admin queue.
 *
 * Bypasses the daily cap, spacing and posting window (the admin chose this
 * moment explicitly) but never the kill switch, the per-platform switch, the
 * configured-credential check or the job eligibility rules.
 */
export async function postJobNow(
  jobId: string,
  platform: SocialPlatform,
): Promise<PostNowResult> {
  const settings = await getSocialSettings();
  if (settings.pauseAll) return { ok: false, reason: "posting is paused (kill switch)" };
  const platformEnabled = platform === "facebook" ? settings.facebookEnabled : settings.instagramEnabled;
  if (!platformEnabled) return { ok: false, reason: "platform is disabled" };

  const [row] = await db
    .select({
      job: jobs,
      companyName: companies.name,
      companyOptedOut: companies.socialPromotionOptOut,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) return { ok: false, reason: "job not found" };

  const [reportRow] = await db
    .select({ value: count() })
    .from(jobReports)
    .where(and(eq(jobReports.jobId, jobId), eq(jobReports.status, "open")));
  const scan = scanJob({
    title: row.job.title,
    description: row.job.description,
    responsibilities: row.job.responsibilities,
    requirements: row.job.requirements,
    salaryMinPaise: row.job.salaryMinPaise,
    salaryMaxPaise: row.job.salaryMaxPaise,
    salaryPeriod: row.job.salaryPeriod,
    experienceMinYears: row.job.experienceMinYears,
    experienceMaxYears: row.job.experienceMaxYears,
  });
  const eligibility = socialPostEligibility({
    jobStatus: row.job.status,
    jobDeleted: Boolean(row.job.deletedAt),
    scanDecision: scan.decision,
    openReportCount: reportRow?.value ?? 0,
    companyOptedOut: row.companyOptedOut,
    // Explicit admin action: master switch does not block it.
    masterEnabled: true,
    platformEnabled,
    paused: settings.pauseAll,
  });
  if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };

  const provider = getSocialProvider(platform);
  if (!provider.isConfigured()) return { ok: false, reason: "provider not configured" };

  const caption = buildSocialCaption({
    job: row.job,
    companyName: row.companyName,
    appUrl: appUrl(),
    platform,
    captionTemplate: settings.captionTemplate,
    hashtags: settings.hashtags,
  });
  const imageUrl = appUrl(`/api/social/card/${row.job.id}`);

  const [existing] = await db
    .select({ id: socialPosts.id, status: socialPosts.status })
    .from(socialPosts)
    .where(and(eq(socialPosts.jobId, jobId), eq(socialPosts.platform, platform)))
    .limit(1);
  if (existing?.status === "published") {
    return { ok: false, reason: "already published for this platform" };
  }

  const now = new Date();
  let postId = existing?.id;
  if (existing) {
    await db
      .update(socialPosts)
      .set({
        status: "publishing",
        caption,
        updatedAt: now,
      })
      .where(eq(socialPosts.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(socialPosts)
      .values({ jobId, platform, status: "publishing", caption, updatedAt: now })
      .onConflictDoNothing({ target: [socialPosts.jobId, socialPosts.platform] })
      .returning({ id: socialPosts.id });
    postId = inserted?.id;
  }
  if (!postId) return { ok: false, reason: "could not create the queued post" };

  try {
    const published = await provider.publish({ message: caption, imageUrl });
    await db
      .update(socialPosts)
      .set({
        status: "published",
        platformPostId: published.platformPostId,
        publishedAt: now,
        attempts: 1,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(socialPosts.id, postId));
    return { ok: true, platformPostId: published.platformPostId };
  } catch (error) {
    const message =
      error instanceof SocialApiError || error instanceof Error
        ? error.message
        : "Unknown error.";
    await db
      .update(socialPosts)
      .set({ status: "failed", attempts: 1, lastError: message, updatedAt: now })
      .where(eq(socialPosts.id, postId));
    return { ok: false, reason: message };
  }
}
