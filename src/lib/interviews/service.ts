import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  applicationStatusHistory,
  companies,
  interviews,
  jobs,
  notifications,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { interviewScheduledEmail } from "@/lib/email/templates/product";
import { appUrl } from "@/lib/email/urls";
import { requireCompanyMembership } from "@/lib/entitlements";

export async function getInterviewApplication(applicationId: string) {
  const [row] = await db
    .select({
      id: applications.id,
      status: applications.status,
      candidateUserId: applications.candidateUserId,
      candidateName: users.fullName,
      candidateEmail: users.email,
      jobId: jobs.id,
      jobTitle: jobs.title,
      companyId: companies.id,
      companyName: companies.name,
      companyStatus: companies.status,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(users, eq(users.id, applications.candidateUserId))
    .where(eq(applications.id, applicationId))
    .limit(1);
  return row ?? null;
}

export async function scheduleApplicationInterview(params: {
  applicationId: string;
  recruiterId: string;
  scheduledAt: Date;
  durationMinutes: number;
  mode: "video" | "phone" | "in_person";
  location: string | null;
  meetingLink: string | null;
  notes: string | null;
}): Promise<void> {
  const context = await getInterviewApplication(params.applicationId);
  if (!context) throw new AppError("Application not found.", 404, "not_found");
  if (context.companyStatus !== "approved") {
    throw new AppError("Company approval is required to schedule interviews.", 403, "company_not_approved");
  }
  if (!["shortlisted", "interview"].includes(context.status)) {
    throw new AppError("Shortlist the candidate before scheduling an interview.", 409, "invalid_application_status");
  }
  await requireCompanyMembership(params.recruiterId, context.companyId);
  if (params.scheduledAt <= new Date()) {
    throw new AppError("Interview time must be in the future.", 422, "invalid_interview_time");
  }

  const scheduled = await db.transaction(async (tx) => {
    const now = new Date();
    const active = (
      await tx.select({ id: interviews.id })
        .from(interviews)
        .where(and(
          eq(interviews.applicationId, context.id),
          inArray(interviews.status, ["scheduled", "confirmed", "rescheduled"]),
        ))
        .orderBy(desc(interviews.createdAt))
        .limit(1)
        .for("update")
    ).at(0);

    let interviewId: string;
    if (active) {
      await tx.update(interviews)
        .set({
          scheduledAt: params.scheduledAt,
          durationMinutes: params.durationMinutes,
          mode: params.mode,
          location: params.location,
          meetingLink: params.meetingLink,
          notes: params.notes,
          status: "rescheduled",
          confirmedAt: null,
          updatedAt: now,
        })
        .where(eq(interviews.id, active.id));
      interviewId = active.id;
    } else {
      const [created] = await tx.insert(interviews).values({
        applicationId: context.id,
        jobId: context.jobId,
        candidateUserId: context.candidateUserId,
        companyId: context.companyId,
        scheduledByUserId: params.recruiterId,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        mode: params.mode,
        location: params.location,
        meetingLink: params.meetingLink,
        notes: params.notes,
      }).returning({ id: interviews.id });
      interviewId = created!.id;
    }

    if (context.status !== "interview") {
      await tx.update(applications)
        .set({
          status: "interview",
          statusChangedAt: now,
          updatedAt: now,
        })
        .where(eq(applications.id, context.id));
      await tx.insert(applicationStatusHistory).values({
        applicationId: context.id,
        fromStatus: context.status,
        toStatus: "interview",
        changedByUserId: params.recruiterId,
        note: "Interview scheduled",
      });
    }
    await tx.insert(notifications).values({
      userId: context.candidateUserId,
      type: "interview_scheduled",
      title: `Interview scheduled: ${context.jobTitle}`,
      body: `An interview with ${context.companyName} is scheduled for ${params.scheduledAt.toLocaleString("en-IN")}.`,
      link: "/dashboard/interviews",
      metadata: { interviewId },
    });
    return interviewId;
  });

  try {
    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: context.candidateEmail,
      toName: context.candidateName,
      templateKey: "interview_scheduled",
      rendered: interviewScheduledEmail({
        candidateName: context.candidateName.split(" ")[0] ?? "there",
        jobTitle: context.jobTitle,
        companyName: context.companyName,
        mode: params.mode,
        scheduledAt: params.scheduledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        durationMinutes: params.durationMinutes,
        meetingLink: params.meetingLink,
        location: params.location,
        notes: params.notes,
        confirmUrl: appUrl("/dashboard/interviews"),
        brand,
      }),
      metadata: { interviewId: scheduled },
    });
  } catch (error) {
    console.error("[interviews] could not queue candidate invitation:", error);
  }
}

export async function listCandidateInterviews(candidateUserId: string) {
  return db
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      durationMinutes: interviews.durationMinutes,
      mode: interviews.mode,
      location: interviews.location,
      meetingLink: interviews.meetingLink,
      notes: interviews.notes,
      candidateNotes: interviews.candidateNotes,
      status: interviews.status,
      confirmedAt: interviews.confirmedAt,
      jobTitle: jobs.title,
      jobSlug: jobs.slug,
      companyName: companies.name,
    })
    .from(interviews)
    .innerJoin(jobs, eq(jobs.id, interviews.jobId))
    .innerJoin(companies, eq(companies.id, interviews.companyId))
    .where(eq(interviews.candidateUserId, candidateUserId))
    .orderBy(desc(interviews.scheduledAt))
    .limit(100);
}

export async function confirmCandidateInterview(params: {
  interviewId: string;
  candidateUserId: string;
  candidateNotes: string | null;
}): Promise<void> {
  const updated = await db
    .update(interviews)
    .set({
      status: "confirmed",
      confirmedAt: new Date(),
      candidateNotes: params.candidateNotes,
      updatedAt: new Date(),
    })
    .where(and(
      eq(interviews.id, params.interviewId),
      eq(interviews.candidateUserId, params.candidateUserId),
      inArray(interviews.status, ["scheduled", "rescheduled"]),
    ))
    .returning({
      scheduledByUserId: interviews.scheduledByUserId,
    });
  if (!updated[0]) {
    throw new AppError("Interview not found or no longer awaiting confirmation.", 404, "not_found");
  }
  const [interview] = await db.select({ jobTitle: jobs.title })
    .from(interviews)
    .innerJoin(jobs, eq(jobs.id, interviews.jobId))
    .where(eq(interviews.id, params.interviewId))
    .limit(1);
  if (updated[0].scheduledByUserId) {
    await db.insert(notifications).values({
      userId: updated[0].scheduledByUserId,
      type: "interview_confirmed",
      title: `Interview confirmed: ${interview?.jobTitle ?? "candidate interview"}`,
      body: "The candidate confirmed the interview invitation.",
      link: "/recruiter/applications",
      metadata: { interviewId: params.interviewId },
    });
  }
}
