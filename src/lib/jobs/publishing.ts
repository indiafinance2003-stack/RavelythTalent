import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, companies, jobs } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { onJobPublished } from "./hooks";

export type JobPublishActor =
  | { role: "system"; userId?: null }
  | { role: "admin" | "recruiter"; userId: string };

/** The single status/date/audit/hook path for every job publication. */
export async function publishJob(
  job: Pick<typeof jobs.$inferSelect, "id"> & Partial<Pick<typeof jobs.$inferSelect, "quotaPeriodKey">>,
  actor: JobPublishActor,
): Promise<typeof jobs.$inferSelect> {
  const published = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ job: jobs, companyStatus: companies.status })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(
        and(
          eq(jobs.id, job.id),
          isNull(jobs.deletedAt),
          inArray(jobs.status, ["draft", "pending_approval", "rejected", "paused", "expired"]),
        ),
      )
      .limit(1);
    if (!current) throw new AppError("Job is no longer available to publish.", 409, "invalid_job_status");
    if (current.companyStatus !== "approved") {
      throw new AppError("The company must be approved before this job can be published.", 409, "company_not_approved");
    }

    const now = new Date();
    const [updated] = await tx
      .update(jobs)
      .set({
        status: "published",
        moderationNotes: null,
        approvedByUserId: actor.role === "system" ? null : actor.userId,
        approvedAt: now,
        publishedAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        ...(job.quotaPeriodKey ? { quotaPeriodKey: job.quotaPeriodKey } : {}),
        updatedAt: now,
      })
      .where(eq(jobs.id, job.id))
      .returning();
    if (!updated) throw new AppError("Could not publish the job.", 500);

    await tx.insert(auditLogs).values({
      actorUserId: actor.role === "system" ? null : actor.userId,
      actorRole: actor.role,
      action: "job.published",
      entityType: "job",
      entityId: updated.id,
      description: `"${updated.title}" was published.`,
      metadata: { actor: actor.role },
    });
    return updated;
  });

  await onJobPublished(published);
  return published;
}
