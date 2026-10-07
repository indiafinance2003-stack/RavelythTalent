import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobReports, jobs, socialPosts } from "@/lib/db/schema";
import { scanJob } from "@/lib/moderation/job-scan";
import { getSocialSettings, getSocialConnectionStatuses } from "./settings";
import { planEnqueue } from "./eligibility";

export type EnqueueResult = {
  enqueued: number;
  reason: string;
};

/**
 * Enqueue one social_posts row per enabled platform when a job is published
 * (called from onJobPublished). Dedupe per job and platform comes from the
 * unique index plus onConflictDoNothing, so re-publishing never duplicates.
 *
 * Eligibility: automatic scan decision "publish", currently published, zero
 * open reports, company not opted out, master + platform switches on, not
 * paused, credentials present.
 */
export async function enqueueSocialPostsForJob(
  job: Pick<typeof jobs.$inferSelect, "id" | "status">,
): Promise<EnqueueResult> {
  const settings = await getSocialSettings();

  const [row] = await db
    .select({
      jobStatus: jobs.status,
      jobDeletedAt: jobs.deletedAt,
      title: jobs.title,
      description: jobs.description,
      responsibilities: jobs.responsibilities,
      requirements: jobs.requirements,
      salaryMinPaise: jobs.salaryMinPaise,
      salaryMaxPaise: jobs.salaryMaxPaise,
      salaryPeriod: jobs.salaryPeriod,
      experienceMinYears: jobs.experienceMinYears,
      experienceMaxYears: jobs.experienceMaxYears,
      companyOptedOut: companies.socialPromotionOptOut,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, job.id))
    .limit(1);

  if (!row) return { enqueued: 0, reason: "job not found" };

  const [reportRow] = await db
    .select({ value: count() })
    .from(jobReports)
    .where(and(eq(jobReports.jobId, job.id), eq(jobReports.status, "open")));

  // Re-run the deterministic safety scan for the eligibility decision.
  const scan = scanJob({
    title: row.title,
    description: row.description,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    salaryMinPaise: row.salaryMinPaise,
    salaryMaxPaise: row.salaryMaxPaise,
    salaryPeriod: row.salaryPeriod,
    experienceMinYears: row.experienceMinYears,
    experienceMaxYears: row.experienceMaxYears,
  });

  const connections = getSocialConnectionStatuses(settings);
  const plan = planEnqueue({
    masterEnabled: settings.enabled,
    paused: settings.pauseAll,
    facebookEnabled: settings.facebookEnabled,
    instagramEnabled: settings.instagramEnabled,
    facebookConfigured: connections[0]?.configured ?? false,
    instagramConfigured: connections[1]?.configured ?? false,
    jobStatus: row.jobStatus,
    jobDeleted: Boolean(row.jobDeletedAt),
    scanDecision: scan.decision,
    openReportCount: reportRow?.value ?? 0,
    companyOptedOut: row.companyOptedOut,
  });

  if (plan.platforms.length === 0) return { enqueued: 0, reason: plan.reason };

  let enqueued = 0;
  for (const platform of plan.platforms) {
    const inserted = await db
      .insert(socialPosts)
      .values({ jobId: job.id, platform, status: "queued" })
      .onConflictDoNothing({ target: [socialPosts.jobId, socialPosts.platform] })
      .returning({ id: socialPosts.id });
    enqueued += inserted.length;
  }
  return { enqueued, reason: enqueued > 0 ? "queued" : "already queued" };
}
