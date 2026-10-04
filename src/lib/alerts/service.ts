import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobAlerts, users } from "@/lib/db/schema";
import { generateToken } from "@/lib/auth/crypto";
import { AppError } from "@/lib/errors";
import { getCandidateEntitlements } from "@/lib/entitlements";
import { searchJobs } from "@/lib/jobs/queries";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { jobAlertEmail } from "@/lib/email/templates/product";
import { appUrl } from "@/lib/email/urls";

/** Job alerts: saved searches delivered by the daily/weekly cron. */

export const ALERT_MAX_FREE = 3;

export type AlertCriteria = {
  q?: string;
  location?: string;
  category?: string;
  jobType?: string;
  workMode?: string;
  salaryMin?: number;
};

export async function listAlerts(userId: string) {
  return db
    .select()
    .from(jobAlerts)
    .where(eq(jobAlerts.userId, userId))
    .orderBy(desc(jobAlerts.createdAt));
}

export async function createAlert(params: {
  userId: string;
  name: string;
  criteria: AlertCriteria;
  frequency: "daily" | "weekly";
}): Promise<string> {
  const features = await getCandidateEntitlements(params.userId);
  const limit = features.get("job_alerts")?.limit ?? ALERT_MAX_FREE;

  if (typeof limit === "number") {
    const existing = await listAlerts(params.userId);
    if (existing.length >= limit) {
      throw new AppError(
        `Your plan allows ${limit} job alert${limit === 1 ? "" : "s"}. Delete one or upgrade to add more.`,
        403,
        "alert_limit_reached",
      );
    }
  }

  const rows = await db
    .insert(jobAlerts)
    .values({
      userId: params.userId,
      name: params.name.trim().slice(0, 120) || "Job alert",
      criteria: params.criteria,
      frequency: params.frequency,
      unsubscribeToken: generateToken(24),
      isActive: true,
    })
    .returning({ id: jobAlerts.id });

  return rows[0]!.id;
}

export async function deleteAlert(userId: string, alertId: string): Promise<void> {
  await db
    .delete(jobAlerts)
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, userId)));
}

export async function toggleAlert(
  userId: string,
  alertId: string,
  isActive: boolean,
): Promise<void> {
  await db
    .update(jobAlerts)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, userId)));
}

/** Public unsubscribe: the token itself is the capability. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const rows = await db
    .select({ id: jobAlerts.id })
    .from(jobAlerts)
    .where(eq(jobAlerts.unsubscribeToken, token))
    .limit(1);
  if (!rows.at(0)) return false;

  await db
    .update(jobAlerts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(jobAlerts.id, rows.at(0)!.id));
  return true;
}

export type AlertRunSummary = { alerts: number; emails: number; skipped: number };

/** Sends due alerts. Daily alerts run daily, weekly ones only on Mondays. */
export async function runJobAlerts(): Promise<AlertRunSummary> {
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;

  const due = await db.select().from(jobAlerts).where(eq(jobAlerts.isActive, true));
  const summary: AlertRunSummary = { alerts: 0, emails: 0, skipped: 0 };

  for (const alert of due) {
    if (alert.frequency === "weekly" && !isMonday) {
      summary.skipped += 1;
      continue;
    }

    summary.alerts += 1;
    const criteria = (alert.criteria ?? {}) as AlertCriteria;
    const since =
      alert.lastSentAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await searchJobs({
      q: criteria.q,
      location: criteria.location,
      category: criteria.category,
      jobType: criteria.jobType,
      workMode: criteria.workMode,
      salaryMin: criteria.salaryMin,
      pageSize: 15,
    });

    const fresh = result.rows.filter(
      (job) => (job.publishedAt ?? job.createdAt).getTime() > since.getTime(),
    );
    if (fresh.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const user = (
      await db
        .select({ email: users.email, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, alert.userId))
        .limit(1)
    ).at(0);

    if (!user) {
      summary.skipped += 1;
      continue;
    }

    const brand = await getEmailBrand();
    const searchParams = new URLSearchParams();
    if (criteria.q) searchParams.set("q", criteria.q);
    if (criteria.location) searchParams.set("location", criteria.location);
    if (criteria.category) searchParams.set("category", criteria.category);

    await queueRenderedEmail({
      to: user.email,
      toName: user.fullName,
      templateKey: "job_alert",
      rendered: jobAlertEmail({
        candidateName: user.fullName.split(" ")[0] ?? "there",
        alertName: alert.name,
        frequency: alert.frequency,
        jobs: fresh.map((job) => ({
          title: job.title,
          companyName: job.companyName,
          city: job.city,
          url: appUrl(`/jobs/${job.slug}`),
        })),
        searchUrl: `${appUrl("/jobs")}?${searchParams.toString()}`,
        manageUrl: appUrl("/dashboard/alerts"),
        unsubscribeUrl: appUrl(
          `/api/alerts/unsubscribe?token=${alert.unsubscribeToken}`,
        ),
        brand,
      }),
      metadata: { alertId: alert.id },
    });

    await db
      .update(jobAlerts)
      .set({ lastSentAt: new Date(), updatedAt: new Date() })
      .where(eq(jobAlerts.id, alert.id));

    summary.emails += 1;
  }

  return summary;
}
