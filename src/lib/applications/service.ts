import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  applicationStatusHistory,
  companies,
  interviews,
  jobs,
  notifications,
  resumes,
  savedJobs,
  users,
} from "@/lib/db/schema";
import { AppError, ConflictError } from "@/lib/errors";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import {
  applicationStatusChangeEmail,
  applicationSubmittedEmail,
} from "@/lib/email/templates/product";
import { applicationReceivedEmail } from "@/lib/email/templates/recruiter";
import { appUrl } from "@/lib/email/urls";
import { APPLICATION_STATUS_LABEL } from "@/lib/utils";

/** Candidate applications, saved jobs and the recruiter pipeline. */

async function notify(params: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    metadata: params.metadata ?? {},
  });
}

export type JobApplyContext = {
  id: string;
  title: string;
  slug: string;
  status: string;
  expiresAt: Date | null;
  companyName: string;
  posterId: string | null;
};

async function loadJobForApply(jobId: string): Promise<JobApplyContext | null> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      slug: jobs.slug,
      status: jobs.status,
      expiresAt: jobs.expiresAt,
      companyName: companies.name,
      posterId: jobs.postedByUserId,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  return rows.at(0) ?? null;
}

async function findUser(userId: string) {
  const rows = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows.at(0) ?? null;
}

const firstName = (fullName: string | undefined) =>
  fullName?.split(" ")[0] ?? "there";

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

export async function applyToJob(params: {
  candidateUserId: string;
  jobId: string;
  resumeId?: string | null;
  coverNote?: string | null;
}): Promise<string> {
  const job = await loadJobForApply(params.jobId);
  if (!job || job.status !== "published" || !job.expiresAt || job.expiresAt < new Date()) {
    throw new AppError("This job is no longer accepting applications.", 409, "job_closed");
  }

  const existing = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.jobId, params.jobId),
        eq(applications.candidateUserId, params.candidateUserId),
      ),
    )
    .limit(1);
  if (existing.at(0)) {
    throw new ConflictError("You have already applied to this job.");
  }

  // Resolve the resume: explicit choice, else the candidate's default.
  let resumeId = params.resumeId ?? null;
  if (!resumeId) {
    const defaults = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(
        and(eq(resumes.userId, params.candidateUserId), sql`${resumes.deletedAt} is null`),
      )
      .orderBy(desc(resumes.isDefault), desc(resumes.createdAt))
      .limit(1);
    resumeId = defaults.at(0)?.id ?? null;
  }

  if (resumeId) {
    const owned = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, params.candidateUserId)))
      .limit(1);
    if (!owned.at(0)) {
      throw new AppError("Invalid resume selection.", 400, "invalid_resume");
    }
  }

  const inserted = await db
    .insert(applications)
    .values({
      jobId: params.jobId,
      candidateUserId: params.candidateUserId,
      resumeId,
      coverNote: params.coverNote?.trim() || null,
      source: "direct",
    })
    .returning({ id: applications.id });

  const applicationId = inserted[0]!.id;

  await db.insert(applicationStatusHistory).values({
    applicationId,
    toStatus: "applied",
    changedByUserId: params.candidateUserId,
    note: "Application submitted by candidate",
  });

  await db
    .update(jobs)
    .set({ applicationsCount: sql`${jobs.applicationsCount} + 1` })
    .where(eq(jobs.id, params.jobId));

  const candidateUser = await findUser(params.candidateUserId);
  const brand = await getEmailBrand();

  await notify({
    userId: params.candidateUserId,
    type: "application_submitted",
    title: `Application sent: ${job.title}`,
    body: `Your application to ${job.companyName} is in review.`,
    link: "/dashboard/applications",
    metadata: { applicationId, jobId: params.jobId },
  });

  if (candidateUser) {
    await queueRenderedEmail({
      to: candidateUser.email,
      toName: candidateUser.fullName,
      templateKey: "application_submitted",
      rendered: applicationSubmittedEmail({
        candidateName: firstName(candidateUser.fullName),
        jobTitle: job.title,
        companyName: job.companyName,
        jobUrl: appUrl(`/jobs/${job.slug}`),
        brand,
      }),
      metadata: { applicationId },
    });
  }

  if (job.posterId) {
    await notify({
      userId: job.posterId,
      type: "application_received",
      title: `New applicant for ${job.title}`,
      link: `/recruiter/applications?job=${params.jobId}`,
      metadata: { applicationId },
    });

    const posterUser = await findUser(job.posterId);
    if (posterUser) {
      await queueRenderedEmail({
        to: posterUser.email,
        toName: posterUser.fullName,
        templateKey: "application_received",
        rendered: applicationReceivedEmail({
          recruiterName: firstName(posterUser.fullName),
          candidateName: candidateUser?.fullName ?? "A candidate",
          jobTitle: job.title,
          candidateUrl: appUrl(`/recruiter/applications?job=${params.jobId}`),
          brand,
        }),
        metadata: { applicationId },
      });
    }
  }

  return applicationId;
}

/* -------------------------------------------------------------------------- */
/* Saved jobs                                                                 */
/* -------------------------------------------------------------------------- */

export async function toggleSavedJob(
  userId: string,
  jobId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: savedJobs.id })
    .from(savedJobs)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .limit(1);

  if (existing.at(0)) {
    await db.delete(savedJobs).where(eq(savedJobs.id, existing.at(0)!.id));
    return false;
  }

  await db.insert(savedJobs).values({ userId, jobId });
  return true;
}

export async function isJobSaved(userId: string, jobId: string): Promise<boolean> {
  const rows = await db
    .select({ id: savedJobs.id })
    .from(savedJobs)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .limit(1);
  return Boolean(rows.at(0));
}

/* -------------------------------------------------------------------------- */
/* Withdraw                                                                   */
/* -------------------------------------------------------------------------- */

export async function withdrawApplication(
  applicationId: string,
  candidateUserId: string,
): Promise<void> {
  const owned = await db
    .select({
      id: applications.id,
      status: applications.status,
      jobId: applications.jobId,
    })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.candidateUserId, candidateUserId),
      ),
    )
    .limit(1);

  const application = owned.at(0);
  if (!application) throw new AppError("Application not found.", 404, "not_found");
  if (["hired", "rejected", "withdrawn"].includes(application.status)) {
    throw new ConflictError("This application can no longer be withdrawn.");
  }

  await db
    .update(applications)
    .set({
      status: "withdrawn",
      statusChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  await db.insert(applicationStatusHistory).values({
    applicationId,
    fromStatus: application.status,
    toStatus: "withdrawn",
    changedByUserId: candidateUserId,
    note: "Withdrawn by candidate",
  });

  await db
    .update(jobs)
    .set({ applicationsCount: sql`greatest(0, ${jobs.applicationsCount} - 1)` })
    .where(eq(jobs.id, application.jobId));
}

/* -------------------------------------------------------------------------- */
/* Recruiter status changes                                                   */
/* -------------------------------------------------------------------------- */

export type RecruiterStatusChange =
  | "viewed"
  | "shortlisted"
  | "interview"
  | "offered"
  | "hired"
  | "rejected";

export async function changeApplicationStatus(params: {
  applicationId: string;
  newStatus: RecruiterStatusChange;
  recruiterUserId: string;
  note?: string | null;
  /** Verifies the recruiter belongs to the job's company. */
  assertMembership: () => Promise<void>;
}): Promise<void> {
  await params.assertMembership();

  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      candidateUserId: applications.candidateUserId,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobSlug: jobs.slug,
      companyName: companies.name,
      posterId: jobs.postedByUserId,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(applications.id, params.applicationId))
    .limit(1);

  const application = rows.at(0);
  if (!application) throw new AppError("Application not found.", 404, "not_found");
  if (application.status === params.newStatus) return;

  await db
    .update(applications)
    .set({
      status: params.newStatus,
      statusChangedAt: new Date(),
      updatedAt: new Date(),
      ...(params.note ? { recruiterNotes: params.note } : {}),
    })
    .where(eq(applications.id, params.applicationId));

  await db.insert(applicationStatusHistory).values({
    applicationId: params.applicationId,
    fromStatus: application.status,
    toStatus: params.newStatus,
    changedByUserId: params.recruiterUserId,
    note: params.note ?? null,
  });

  const statusLabel = APPLICATION_STATUS_LABEL[params.newStatus] ?? params.newStatus;

  await notify({
    userId: application.candidateUserId,
    type: "application_status",
    title: `${statusLabel}: ${application.jobTitle}`,
    body: params.note ?? `Your application moved to ${statusLabel}.`,
    link: "/dashboard/applications",
    metadata: { applicationId: params.applicationId, status: params.newStatus },
  });

  const candidateUser = await findUser(application.candidateUserId);
  if (candidateUser) {
    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: candidateUser.email,
      toName: candidateUser.fullName,
      templateKey: "application_status_change",
      rendered: applicationStatusChangeEmail({
        candidateName: firstName(candidateUser.fullName),
        jobTitle: application.jobTitle,
        companyName: application.companyName,
        statusLabel,
        note: params.note ?? null,
        jobUrl: appUrl(`/jobs/${application.jobSlug}`),
        brand,
      }),
      metadata: { applicationId: params.applicationId },
    });
  }
}

/** Interview attached to an application, if any (checked before cancelling). */
export async function getApplicationInterview(applicationId: string) {
  const rows = await db
    .select()
    .from(interviews)
    .where(eq(interviews.applicationId, applicationId))
    .limit(1);
  return rows.at(0) ?? null;
}