import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLogs,
  companies,
  companyVerificationDocuments,
  jobs,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import {
  companyVerificationApprovedEmail,
  companyVerificationRejectedEmail,
  jobApprovedEmail,
  jobRejectedEmail,
} from "@/lib/email/templates/recruiter";
import { appUrl } from "@/lib/email/urls";
import { publishJob } from "@/lib/jobs/publishing";

export async function listCompanyReviewQueue() {
  const [companyRows, documents] = await Promise.all([
    db
      .select({
        id: companies.id,
        name: companies.name,
        website: companies.website,
        statusReason: companies.statusReason,
        createdAt: companies.createdAt,
        ownerName: users.fullName,
        ownerEmail: users.email,
      })
      .from(companies)
      .innerJoin(users, eq(users.id, companies.ownerUserId))
      .where(eq(companies.status, "pending"))
      .orderBy(asc(companies.createdAt))
      .limit(100),
    db
      .select({
        id: companyVerificationDocuments.id,
        companyId: companyVerificationDocuments.companyId,
        docType: companyVerificationDocuments.docType,
        originalName: companyVerificationDocuments.originalName,
        mimeType: companyVerificationDocuments.mimeType,
        createdAt: companyVerificationDocuments.createdAt,
      })
      .from(companyVerificationDocuments)
      .where(eq(companyVerificationDocuments.status, "pending"))
      .orderBy(asc(companyVerificationDocuments.createdAt))
      .limit(300),
  ]);
  return { companies: companyRows, documents };
}

export async function listManagedCompanies() {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      status: companies.status,
      statusReason: companies.statusReason,
      ownerName: users.fullName,
      ownerEmail: users.email,
      updatedAt: companies.updatedAt,
    })
    .from(companies)
    .innerJoin(users, eq(users.id, companies.ownerUserId))
    .where(inArray(companies.status, ["approved", "suspended"]))
    .orderBy(desc(companies.updatedAt))
    .limit(200);
}

export async function listJobReviewQueue() {
  return db
    .select({
      id: jobs.id,
      companyId: companies.id,
      companyName: companies.name,
      title: jobs.title,
      slug: jobs.slug,
      description: jobs.description,
      responsibilities: jobs.responsibilities,
      requirements: jobs.requirements,
      moderationNotes: jobs.moderationNotes,
      city: jobs.city,
      state: jobs.state,
      createdAt: jobs.createdAt,
      recruiterName: users.fullName,
      recruiterEmail: users.email,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(users, eq(users.id, jobs.postedByUserId))
    .where(and(eq(jobs.status, "pending_approval"), eq(companies.status, "approved")))
    .orderBy(asc(jobs.createdAt))
    .limit(100);
}

type CompanyDecision = {
  ownerName: string;
  ownerEmail: string;
  companyName: string;
};

async function updateCompanyDecision(
  adminId: string,
  companyId: string,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<CompanyDecision> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: companies.id,
        name: companies.name,
        ownerName: users.fullName,
        ownerEmail: users.email,
      })
      .from(companies)
      .innerJoin(users, eq(users.id, companies.ownerUserId))
      .where(and(eq(companies.id, companyId), eq(companies.status, "pending")))
      .limit(1);
    const company = rows.at(0);
    if (!company) {
      throw new AppError("Pending company not found.", 404, "not_found");
    }

    const now = new Date();
    await tx
      .update(companies)
      .set({
        status: decision,
        statusReason: decision === "rejected" ? reason : null,
        reviewedByUserId: adminId,
        reviewedAt: now,
        verifiedAt: decision === "approved" ? now : null,
        updatedAt: now,
      })
      .where(eq(companies.id, companyId));

    await tx
      .update(companyVerificationDocuments)
      .set({
        status: decision,
        notes: decision === "rejected" ? reason : null,
        reviewedByUserId: adminId,
        reviewedAt: now,
      })
      .where(
        and(
          eq(companyVerificationDocuments.companyId, companyId),
          eq(companyVerificationDocuments.status, "pending"),
        ),
      );

    await tx.insert(auditLogs).values({
      actorUserId: adminId,
      actorRole: "admin",
      action: `company.${decision}`,
      entityType: "company",
      entityId: companyId,
      description: `${company.name} was ${decision}.`,
      metadata: reason ? { reason } : {},
    });

    return {
      ownerName: company.ownerName,
      ownerEmail: company.ownerEmail,
      companyName: company.name,
    };
  });
}

async function queueCompanyDecisionEmail(
  result: CompanyDecision,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<void> {
  try {
    const brand = await getEmailBrand();
    const rendered =
      decision === "approved"
        ? companyVerificationApprovedEmail({
            ownerName: result.ownerName,
            companyName: result.companyName,
            brand,
          })
        : companyVerificationRejectedEmail({
            ownerName: result.ownerName,
            companyName: result.companyName,
            reason: reason!,
            brand,
          });
    await queueRenderedEmail({
      to: result.ownerEmail,
      toName: result.ownerName,
      templateKey: `company_verification_${decision}`,
      rendered,
    });
  } catch (error) {
    console.error("[admin] could not queue company decision email:", error);
  }
}

export async function decideCompanyReview(
  adminId: string,
  companyId: string,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<void> {
  const result = await updateCompanyDecision(adminId, companyId, decision, reason);
  await queueCompanyDecisionEmail(result, decision, reason);
}

type JobDecision = {
  jobId: string;
  companyId: string;
  title: string;
  slug: string;
  recruiterName: string;
  recruiterEmail: string;
};

async function updateJobDecision(
  adminId: string,
  jobId: string,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<JobDecision> {
  if (decision === "approved") {
    const [job] = await db
      .select({
        jobId: jobs.id,
        companyId: companies.id,
        companyStatus: companies.status,
        title: jobs.title,
        slug: jobs.slug,
        recruiterName: users.fullName,
        recruiterEmail: users.email,
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(users, eq(users.id, jobs.postedByUserId))
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending_approval")))
      .limit(1);
    if (!job) throw new AppError("Pending job not found.", 404, "not_found");
    if (job.companyStatus !== "approved") {
      throw new AppError(
        "The company is no longer approved; this job cannot be reviewed.",
        409,
        "company_not_approved",
      );
    }
    await publishJob({ id: jobId }, { role: "admin", userId: adminId });
    return {
      jobId: job.jobId,
      companyId: job.companyId,
      title: job.title,
      slug: job.slug,
      recruiterName: job.recruiterName ?? "Recruiter",
      recruiterEmail: job.recruiterEmail ?? "",
    };
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        jobId: jobs.id,
        companyId: companies.id,
        companyStatus: companies.status,
        title: jobs.title,
        slug: jobs.slug,
        recruiterName: users.fullName,
        recruiterEmail: users.email,
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(users, eq(users.id, jobs.postedByUserId))
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending_approval")))
      .limit(1);
    const job = rows.at(0);
    if (!job) throw new AppError("Pending job not found.", 404, "not_found");
    if (job.companyStatus !== "approved") {
      throw new AppError(
        "The company is no longer approved; this job cannot be reviewed.",
        409,
        "company_not_approved",
      );
    }

    const now = new Date();
    await tx
      .update(jobs)
      .set({
        status: "rejected",
        moderationNotes: reason,
        approvedByUserId: adminId,
        approvedAt: now,
        publishedAt: null,
        expiresAt: null,
        updatedAt: now,
      })
      .where(eq(jobs.id, jobId));

    await tx.insert(auditLogs).values({
      actorUserId: adminId,
      actorRole: "admin",
      action: "job.rejected",
      entityType: "job",
      entityId: jobId,
      description: `"${job.title}" was ${decision}.`,
      metadata: reason ? { reason } : {},
    });

    return {
      jobId: job.jobId,
      companyId: job.companyId,
      title: job.title,
      slug: job.slug,
      recruiterName: job.recruiterName ?? "Recruiter",
      recruiterEmail: job.recruiterEmail ?? "",
    };
  });
}

export async function decideJobReview(
  adminId: string,
  jobId: string,
  decision: "approved" | "rejected",
  reason: string | null,
): Promise<void> {
  const result = await updateJobDecision(adminId, jobId, decision, reason);
  if (!result.recruiterEmail) {
    console.error(`[admin] no recruiter email available for job ${result.jobId}`);
    return;
  }
  try {
    const brand = await getEmailBrand();
    const rendered =
      decision === "approved"
        ? jobApprovedEmail({
            recruiterName: result.recruiterName,
            jobTitle: result.title,
            jobUrl: appUrl(`/jobs/${result.slug}`),
            brand,
          })
        : jobRejectedEmail({
            recruiterName: result.recruiterName,
            jobTitle: result.title,
            reason: reason!,
            editUrl: appUrl(
              `/recruiter/jobs/${result.jobId}?company=${result.companyId}`,
            ),
            brand,
          });
    await queueRenderedEmail({
      to: result.recruiterEmail,
      toName: result.recruiterName,
      templateKey: `job_${decision}`,
      rendered,
    });
  } catch (error) {
    console.error("[admin] could not queue job decision email:", error);
  }
}
