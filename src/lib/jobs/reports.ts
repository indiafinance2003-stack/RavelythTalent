import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { auditLogs, companies, jobReports, jobs, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { jobReportThresholdEmail } from "@/lib/email/templates/recruiter";
import { appUrl } from "@/lib/email/urls";
import { getSiteSettings } from "@/lib/settings";

export const JOB_REPORT_AUTO_PAUSE_THRESHOLD = 3;

export function shouldPauseJobForReports(distinctReporters: number): boolean {
  return distinctReporters >= JOB_REPORT_AUTO_PAUSE_THRESHOLD;
}

export type JobReportReason =
  | "scam_or_asks_for_money"
  | "fake_or_already_filled"
  | "discriminatory"
  | "other";

export async function createJobReport(params: {
  jobId: string;
  userId: string | null;
  ip: string;
  reason: JobReportReason;
  note: string | null;
}): Promise<void> {
  const reporterKey = params.userId
    ? `user:${params.userId}`
    : `ip:${createHash("sha256").update(params.ip).digest("hex")}`;

  const result = await db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id, title: jobs.title, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.id, params.jobId), isNull(jobs.deletedAt)))
      .limit(1);
    if (!job || job.status !== "published") {
      throw new AppError("This job is no longer available for reporting.", 404, "job_not_found");
    }

    const inserted = await tx
      .insert(jobReports)
      .values({
        jobId: job.id,
        reporterUserId: params.userId,
        reporterKey,
        reason: params.reason,
        note: params.note,
      })
      .onConflictDoNothing({
        target: [jobReports.jobId, jobReports.reporterKey],
      })
      .returning({ id: jobReports.id });
    if (!inserted[0]) {
      throw new AppError("You have already reported this job.", 409, "duplicate_report");
    }

    const [countRow] = await tx
      .select({ reporters: sql<number>`count(distinct ${jobReports.reporterKey})::int` })
      .from(jobReports)
      .where(eq(jobReports.jobId, job.id));
    const reporters = countRow?.reporters ?? 0;
    if (!shouldPauseJobForReports(reporters)) return { paused: false, job };

    const [paused] = await tx
      .update(jobs)
      .set({
        status: "paused",
        moderationNotes: "Automatically paused after reports from three distinct reporters.",
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "published")))
      .returning({ id: jobs.id });
    if (!paused) return { paused: false, job };

    await tx.insert(auditLogs).values({
      actorRole: "system",
      action: "job.auto_paused_by_reports",
      entityType: "job",
      entityId: job.id,
      description: `"${job.title}" was automatically paused after reports from three distinct reporters.`,
      metadata: { distinctReporters: reporters },
    });
    return { paused: true, job };
  });

  if (result.paused) await notifyAdminsAboutReportThreshold(result.job.id, result.job.title);
}

async function notifyAdminsAboutReportThreshold(jobId: string, title: string): Promise<void> {
  try {
    const [admins, settings] = await Promise.all([
      db.select({ email: users.email, name: users.fullName })
        .from(users).where(eq(users.role, "admin")),
      getSiteSettings(),
    ]);
    const recipients = new Map(admins.map((admin) => [admin.email, admin.name]));
    if (settings.supportEmail) recipients.set(settings.supportEmail, "Admin");
    if (!recipients.size) {
      console.error(`[reports] no admin email configured for paused job ${jobId}`);
      return;
    }
    const brand = await getEmailBrand();
    const rendered = jobReportThresholdEmail({
      jobTitle: title,
      jobId,
      reportCount: JOB_REPORT_AUTO_PAUSE_THRESHOLD,
      adminUrl: appUrl(`/admin/reports?job=${jobId}`),
      brand,
    });
    await Promise.all(
      [...recipients].map(([email, name]) =>
        queueRenderedEmail({
          to: email,
          toName: name,
          templateKey: "job_report_threshold",
          rendered,
          metadata: { jobId },
        }),
      ),
    );
  } catch (error) {
    console.error(`[reports] could not queue admin notice for job ${jobId}:`, error);
  }
}

export async function listOpenJobReports() {
  const rows = await db
    .select({
      id: jobReports.id,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobSlug: jobs.slug,
      companyName: companies.name,
      reason: jobReports.reason,
      note: jobReports.note,
      reporterName: users.fullName,
      reporterEmail: users.email,
      createdAt: jobReports.createdAt,
      reporterCount: sql<number>`(
        select count(distinct reports.reporter_key)::int
        from job_reports reports
        where reports.job_id = ${jobReports.jobId}
      )`,
    })
    .from(jobReports)
    .innerJoin(jobs, eq(jobs.id, jobReports.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(users, eq(users.id, jobReports.reporterUserId))
    .where(eq(jobReports.status, "open"))
    .orderBy(jobReports.createdAt)
    .limit(250);
  return rows;
}

export async function markJobReportReviewed(
  reportId: string,
  adminId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [report] = await tx
      .select({ id: jobReports.id, jobId: jobReports.jobId, reason: jobReports.reason })
      .from(jobReports)
      .where(and(eq(jobReports.id, reportId), eq(jobReports.status, "open")))
      .limit(1);
    if (!report) throw new AppError("Open report not found.", 404, "not_found");
    await tx
      .update(jobReports)
      .set({ status: "reviewed", reviewedByUserId: adminId, reviewedAt: new Date() })
      .where(eq(jobReports.id, reportId));
    await tx.insert(auditLogs).values({
      actorUserId: adminId,
      actorRole: "admin",
      action: "job_report.reviewed",
      entityType: "job_report",
      entityId: report.id,
      description: `Reviewed report for job ${report.jobId}.`,
      metadata: { reason: report.reason },
    });
  });
}
