import { and, count, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobReports, jobs, socialPosts, socialSettings } from "@/lib/db/schema";
import { scanJob } from "@/lib/moderation/job-scan";
import { appUrl } from "@/lib/email/urls";
import { getSocialSettings } from "./settings";
import { socialPostEligibility } from "./eligibility";
import { buildSocialCaption } from "./content";
import { canPublishSocialPost, retryDelayMs, startOfIstDay, MAX_POST_ATTEMPTS } from "./schedule";
import { getSocialProvider, SocialTokenError } from "./providers";

export type ProcessSocialResult = {
  published: number;
  failed: number;
  skipped: number;
  deferred: number;
  tokenErrors: number;
};

/**
 * Send due queued posts for one cron run (/api/internal/cron/process-social-posts).
 *
 * For each platform: re-verify eligibility (a queued post is skipped if the
 * job stopped being eligible), respect the daily cap, minimum spacing and the
 * IST posting window, publish through the SocialProvider adapter, and record
 * status, platform post id, error text and timestamps. Failures retry with
 * exponential backoff up to MAX_POST_ATTEMPTS; token errors stop retries and
 * set a banner field on social_settings for the admin UI.
 */
export async function processSocialPosts(now = new Date()): Promise<ProcessSocialResult> {
  const result: ProcessSocialResult = {
    published: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
    tokenErrors: 0,
  };

  const settings = await getSocialSettings();
  if (!settings.enabled || settings.pauseAll) return result;

  const dayStart = startOfIstDay(now);

  for (const platform of ["facebook", "instagram"] as const) {
    const platformEnabled =
      platform === "facebook" ? settings.facebookEnabled : settings.instagramEnabled;
    if (!platformEnabled) continue;

    const [dueCountRow] = await db
      .select({ value: count() })
      .from(socialPosts)
      .where(and(eq(socialPosts.platform, platform), eq(socialPosts.status, "queued")));
    if (!dueCountRow?.value) continue;

    const [todayRow] = await db
      .select({ value: count() })
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.platform, platform),
          eq(socialPosts.status, "published"),
          sql`${socialPosts.publishedAt} >= ${dayStart}`,
        ),
      );
    const [lastRow] = await db
      .select({ publishedAt: socialPosts.publishedAt })
      .from(socialPosts)
      .where(and(eq(socialPosts.platform, platform), eq(socialPosts.status, "published")))
      .orderBy(desc(socialPosts.publishedAt))
      .limit(1);

    const gate = canPublishSocialPost({
      now,
      windowStart: settings.windowStart,
      windowEnd: settings.windowEnd,
      publishedToday: todayRow?.value ?? 0,
      maxPostsPerDay: settings.maxPostsPerDay,
      lastPublishedAt: lastRow?.publishedAt ?? null,
      minMinutesBetweenPosts: settings.minMinutesBetweenPosts,
    });
    if (!gate.allowed) {
      result.deferred += dueCountRow.value;
      continue;
    }

    const duePosts = await db
      .select({
        post: socialPosts,
        job: jobs,
        companyName: companies.name,
        companyOptedOut: companies.socialPromotionOptOut,
      })
      .from(socialPosts)
      .innerJoin(jobs, eq(jobs.id, socialPosts.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(
        and(
          eq(socialPosts.platform, platform),
          eq(socialPosts.status, "queued"),
          lte(socialPosts.nextAttemptAt, now),
        ),
      )
      .orderBy(socialPosts.nextAttemptAt)
      .limit(5);
    if (!duePosts.length) continue;

    const provider = getSocialProvider(platform);

    for (const row of duePosts) {
      // Re-verify eligibility immediately before sending.
      const [reportRow] = await db
        .select({ value: count() })
        .from(jobReports)
        .where(and(eq(jobReports.jobId, row.job.id), eq(jobReports.status, "open")));
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
        masterEnabled: settings.enabled,
        platformEnabled,
        paused: settings.pauseAll,
      });
      if (!eligibility.eligible) {
        await db
          .update(socialPosts)
          .set({ status: "skipped", lastError: eligibility.reason, updatedAt: now })
          .where(eq(socialPosts.id, row.post.id));
        result.skipped += 1;
        continue;
      }

      if (!provider.isConfigured()) {
        await db
          .update(socialPosts)
          .set({ status: "failed", lastError: "Provider not configured.", updatedAt: now })
          .where(eq(socialPosts.id, row.post.id));
        result.failed += 1;
        continue;
      }

      const caption = buildSocialCaption({
        job: row.job,
        companyName: row.companyName,
        appUrl: appUrl(),
        platform,
        captionTemplate: settings.captionTemplate,
        hashtags: settings.hashtags,
      });
      const imageUrl = appUrl(`/api/social/card/${row.job.id}`);

      await db
        .update(socialPosts)
        .set({ status: "publishing", caption, updatedAt: now })
        .where(eq(socialPosts.id, row.post.id));

      try {
        const published = await provider.publish({ message: caption, imageUrl });
        await db
          .update(socialPosts)
          .set({
            status: "published",
            platformPostId: published.platformPostId,
            publishedAt: now,
            attempts: row.post.attempts + 1,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(socialPosts.id, row.post.id));
        await clearTokenError(platform);
        result.published += 1;
      } catch (error) {
        const attempts = row.post.attempts + 1;
        const message = error instanceof Error ? error.message : "Unknown error.";
        if (error instanceof SocialTokenError) {
          await db
            .update(socialPosts)
            .set({ status: "failed", attempts, lastError: message, updatedAt: now })
            .where(eq(socialPosts.id, row.post.id));
          await recordTokenError(platform, message);
          result.tokenErrors += 1;
          result.failed += 1;
          // Stop this platform's run: every later call would fail the same way.
          break;
        }
        const delay = attempts >= MAX_POST_ATTEMPTS ? null : retryDelayMs(attempts);
        await db
          .update(socialPosts)
          .set({
            status: delay === null ? "failed" : "queued",
            attempts,
            lastError: message,
            nextAttemptAt:
              delay === null ? row.post.nextAttemptAt : new Date(now.getTime() + delay),
            updatedAt: now,
          })
          .where(eq(socialPosts.id, row.post.id));
        result.failed += 1;
      }
    }
  }

  return result;
}

async function recordTokenError(
  platform: "facebook" | "instagram",
  message: string,
): Promise<void> {
  const field =
    platform === "facebook"
      ? { facebookTokenError: message }
      : { instagramTokenError: message };
  await db
    .update(socialSettings)
    .set({ ...field, updatedAt: new Date() })
    .where(eq(socialSettings.id, 1));
}

async function clearTokenError(platform: "facebook" | "instagram"): Promise<void> {
  const field =
    platform === "facebook"
      ? { facebookTokenError: null }
      : { instagramTokenError: null };
  await db
    .update(socialSettings)
    .set({ ...field, updatedAt: new Date() })
    .where(eq(socialSettings.id, 1));
}

