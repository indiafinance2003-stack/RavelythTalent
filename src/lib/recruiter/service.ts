import { and, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  auditLogs,
  candidateProfiles,
  companies,
  companyMembers,
  companyVerificationDocuments,
  jobs,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  activeCandidatePremiumSql,
  checkInternshipQuota,
  checkJobQuota,
  getInternshipQuota,
  listUserCompanies,
  quotaPeriodKey,
  requireCompanyMembership,
} from "@/lib/entitlements";
import {
  assertCompanyIdentityAvailable,
  normalizeCompanyName,
  normalizeContactPhone,
  normalizeWebsiteDomain,
} from "@/lib/company-identity";
import {
  companyVerificationSubmittedEmail,
  freeJobCreditLimitReachedEmail,
  freeJobCreditWarningEmail,
  jobApprovedEmail,
  jobModerationDecisionEmail,
} from "@/lib/email/templates/recruiter";
import {
  getEmailBrand,
  queueRenderedEmail,
} from "@/lib/email/send";
import { appUrl } from "@/lib/email/urls";
import {
  resolveJobScanDecision,
  scanJob,
  type JobScanInput,
  type JobScanResult,
} from "@/lib/moderation/job-scan";
import { getSiteSettings } from "@/lib/settings";
import { publishJob } from "@/lib/jobs/publishing";
import {
  readValidatedUpload,
  storeValidatedFile,
} from "@/lib/storage";
import { uniqueSlug } from "@/lib/utils";

/**
 * Recruiter-area service: company profile, job postings and the applicant
 * pipeline. Every write verifies company membership first - membership is the
 * only gate that matters here, entitlements are checked on top of it.
 */

/* -------------------------------------------------------------------------- */
/* Company context                                                            */
/* -------------------------------------------------------------------------- */

export type RecruiterCompany = {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
};

/**
 * Resolves the active company for a recruiter page. `requestedId` comes from
 * `?company=`; when missing or not a member-of, the first company wins.
 * Returns null when the user belongs to no company (company setup flow).
 */
export async function resolveRecruiterCompany(
  userId: string,
  requestedId?: string | null,
): Promise<RecruiterCompany | null> {
  const companiesList = await listUserCompanies(userId);
  if (companiesList.length === 0) return null;
  if (requestedId) {
    const match = companiesList.find((c) => c.id === requestedId);
    if (match) return match;
  }
  return companiesList[0]!;
}

export async function getCompanyForEdit(
  userId: string,
  companyId: string,
) {
  await requireCompanyMembership(userId, companyId, "admin");
  const rows = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = rows.at(0);
  if (!company) throw new AppError("Company not found.", 404, "not_found");
  return company;
}

const COMPANY_NAME_MAX = 160;

export type CompanyProfileInput = {
  name: string;
  about: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  foundedYear: number | null;
  headquarters: string | null;
  locations: string[];
  contactEmail: string | null;
  contactPhone: string | null;
};

export async function updateCompanyProfile(
  userId: string,
  companyId: string,
  input: CompanyProfileInput,
): Promise<void> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > COMPANY_NAME_MAX) {
    throw new AppError("Company name must be 2-160 characters.", 422, "invalid_name");
  }
  await requireCompanyMembership(userId, companyId, "admin");
  await assertCompanyIdentityAvailable({
    normalizedName: normalizeCompanyName(name),
    websiteDomain: normalizeWebsiteDomain(input.website),
    normalizedContactPhone: normalizeContactPhone(input.contactPhone),
  }, companyId);

  await db
    .update(companies)
    .set({
      name,
      normalizedName: normalizeCompanyName(name),
      about: input.about?.trim() || null,
      industry: input.industry?.trim() || null,
      size: (input.size as never) ?? null,
      website: input.website?.trim() || null,
      websiteDomain: normalizeWebsiteDomain(input.website),
      foundedYear: input.foundedYear,
      headquarters: input.headquarters?.trim() || null,
      locations: input.locations.map((city) => ({ city })),
      contactEmail: input.contactEmail?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      normalizedContactPhone: normalizeContactPhone(input.contactPhone),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
}

/** Creates a company for a recruiter who registered without one. */
export async function createCompanyForUser(
  userId: string,
  name: string,
  website?: string | null,
  contactPhone?: string | null,
): Promise<string> {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > COMPANY_NAME_MAX) {
    throw new AppError("Company name must be 2-160 characters.", 422, "invalid_name");
  }
  const existing = await listUserCompanies(userId);
  if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new AppError("You already belong to a company with that name.", 409, "duplicate_company");
  }

  const normalizedName = normalizeCompanyName(trimmed);
  const websiteDomain = normalizeWebsiteDomain(website);
  const normalizedContactPhone = normalizeContactPhone(contactPhone);
  await assertCompanyIdentityAvailable({
    normalizedName,
    websiteDomain,
    normalizedContactPhone,
  });
  const slug = uniqueSlug(trimmed);
  const inserted = await db
    .insert(companies)
    .values({
      ownerUserId: userId,
      name: trimmed,
      normalizedName,
      slug,
      website: website?.trim() || null,
      websiteDomain,
      contactPhone: contactPhone?.trim() || null,
      normalizedContactPhone,
      contactEmail: null,
      status: "pending",
    })
    .returning({ id: companies.id });

  const companyId = inserted[0]!.id;
  await db.insert(companyMembers).values({
    companyId,
    userId,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });
  return companyId;
}

/**
 * Uploads a verification document and (re)submits the company for review.
 * A rejected company goes back to pending so the admin queue sees it again.
 */
export async function submitVerificationDocument(params: {
  userId: string;
  companyId: string;
  file: File;
  docType: string;
}): Promise<void> {
  await requireCompanyMembership(params.userId, params.companyId, "admin");
  const companyRows = await db
    .select({
      name: companies.name,
      status: companies.status,
      ownerName: users.fullName,
      ownerEmail: users.email,
    })
    .from(companies)
    .innerJoin(users, eq(users.id, companies.ownerUserId))
    .where(eq(companies.id, params.companyId))
    .limit(1);
  const company = companyRows.at(0);
  if (!company) throw new AppError("Company not found.", 404, "not_found");
  if (company.status === "approved" || company.status === "suspended") {
    throw new AppError(
      "This company cannot submit verification documents in its current status.",
      409,
      "invalid_company_status",
    );
  }

  const { buffer, mimeType } = await readValidatedUpload(params.file, {
    allowedMimes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
    ],
    maxBytes: 5 * 1024 * 1024,
  });
  const stored = await storeValidatedFile("verification", buffer, mimeType);

  await db.insert(companyVerificationDocuments).values({
    companyId: params.companyId,
    docType: params.docType,
    originalName: params.file.name,
    storagePath: stored.storagePath,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    status: "pending",
  });

  await db
    .update(companies)
    .set({ status: "pending", statusReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(companies.id, params.companyId),
        inArray(companies.status, ["rejected", "pending"]),
      ),
    );

  try {
    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: company.ownerEmail,
      toName: company.ownerName,
      templateKey: "company_verification_submitted",
      rendered: companyVerificationSubmittedEmail({
        ownerName: company.ownerName,
        companyName: company.name,
        brand,
      }),
    });
  } catch (error) {
    console.error("[recruiter] could not queue verification email:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Jobs                                                                       */
/* -------------------------------------------------------------------------- */

export type RecruiterJobRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  city: string | null;
  jobType: string;
  workMode: string;
  applicationsCount: number;
  viewsCount: number;
  createdAt: Date;
  publishedAt: Date | null;
  expiresAt: Date | null;
  moderationNotes: string | null;
};

export async function listCompanyJobs(
  companyId: string,
  filter?: { status?: string | undefined },
): Promise<RecruiterJobRow[]> {
  const conditions = [eq(jobs.companyId, companyId), isNull(jobs.deletedAt)];
  if (filter?.status) {
    conditions.push(eq(jobs.status, filter.status as never));
  }
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      slug: jobs.slug,
      status: jobs.status,
      city: jobs.city,
      jobType: jobs.jobType,
      workMode: jobs.workMode,
      applicationsCount: jobs.applicationsCount,
      viewsCount: jobs.viewsCount,
      createdAt: jobs.createdAt,
      publishedAt: jobs.publishedAt,
      expiresAt: jobs.expiresAt,
      moderationNotes: jobs.moderationNotes,
    })
    .from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt))
    .limit(200);
}

/** Statuses a recruiter may still edit content for (publishing state untouched). */
export const EDITABLE_JOB_STATUSES = new Set(["draft", "pending_approval", "rejected", "published", "paused"]);

/** Loads a job only if it belongs to the company (membership re-checked). */
export async function getCompanyJob(
  userId: string,
  companyId: string,
  jobId: string,
) {
  await requireCompanyMembership(userId, companyId);
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId), isNull(jobs.deletedAt)))
    .limit(1);
  const job = rows.at(0);
  if (!job) throw new AppError("Job not found.", 404, "not_found");
  return job;
}

export type JobFormInput = {
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  categoryId: string | null;
  jobType: string;
  workMode: string;
  city: string | null;
  state: string | null;
  salaryMinRupees: number | null;
  salaryMaxRupees: number | null;
  salaryPeriod: string;
  salaryHidden: boolean;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  stipendType: string | null;
  stipendMinRupees: number | null;
  stipendMaxRupees: number | null;
  durationMonths: number | null;
  startDate: Date | null;
  eligibility: string | null;
  ppoPossible: boolean;
  certificateProvided: boolean;
  openings: number;
  deadline: Date | null;
};

function jobValuesForInsert(
  companyId: string,
  userId: string,
  input: JobFormInput,
) {
  return {
    companyId,
    postedByUserId: userId,
    createdByUserId: userId,
    title: input.title.trim(),
    slug: uniqueSlug(input.title),
    description: input.description.trim(),
    responsibilities: input.responsibilities?.trim() || null,
    requirements: input.requirements?.trim() || null,
    categoryId: input.categoryId,
    jobType: input.jobType as never,
    workMode: input.workMode as never,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    salaryMinPaise:
      input.salaryMinRupees === null ? null : Math.round(input.salaryMinRupees * 100),
    salaryMaxPaise:
      input.salaryMaxRupees === null ? null : Math.round(input.salaryMaxRupees * 100),
    salaryPeriod: input.salaryPeriod as never,
    salaryHidden: input.salaryHidden,
    experienceMinYears:
      input.experienceMinYears === null ? null : String(input.experienceMinYears),
    experienceMaxYears:
      input.experienceMaxYears === null ? null : String(input.experienceMaxYears),
    stipendType: input.stipendType as never,
    stipendMinPaise:
      input.stipendMinRupees === null ? null : Math.round(input.stipendMinRupees * 100),
    stipendMaxPaise:
      input.stipendMaxRupees === null ? null : Math.round(input.stipendMaxRupees * 100),
    durationMonths: input.durationMonths,
    startDate: input.startDate,
    eligibility: input.eligibility?.trim() || null,
    ppoPossible: input.ppoPossible,
    certificateProvided: input.certificateProvided,
    openings: input.openings,
    deadline: input.deadline,
  };
}

export type JobSubmissionResult = {
  id: string;
  status: "draft" | "pending_approval" | "published" | "rejected";
  reasons: string[];
};

/** Creates a draft, or scans and submits a job through the moderation path. */
export async function createCompanyJob(params: {
  userId: string;
  companyId: string;
  input: JobFormInput;
  submit: boolean;
}): Promise<JobSubmissionResult> {
  await requireCompanyMembership(params.userId, params.companyId);
  if (!params.submit) {
    const inserted = await db
      .insert(jobs)
      .values({
        ...jobValuesForInsert(params.companyId, params.userId, params.input),
        status: "draft",
      })
      .returning({ id: jobs.id });
    return { id: inserted[0]!.id, status: "draft", reasons: [] };
  }

  await assertCompanyApproved(params.companyId);
  const internship = params.input.jobType === "internship";
  if (internship) {
    await assertInternshipQuotaAvailable(params.companyId);
  } else {
    await assertJobQuotaAvailable(params.companyId);
  }
  const scan = await scanCompanyJob(params.companyId, params.input);
  const settings = await getSiteSettings();
  const decision = resolveJobScanDecision(scan, settings.autoPublishJobs);
  if (decision.status === "rejected") {
    const [job] = await db
      .insert(jobs)
      .values({
        ...jobValuesForInsert(params.companyId, params.userId, params.input),
        status: "rejected",
        moderationNotes: decision.reasons.join("\n"),
      })
      .returning({ id: jobs.id });
    if (!job) throw new AppError("Could not save the blocked job post.", 500);
    await db.insert(auditLogs).values({
      actorRole: "system",
      action: "job.auto_blocked",
      entityType: "job",
      entityId: job.id,
      description: `The safety scan blocked "${params.input.title}".`,
      metadata: { score: scan.score, reasons: decision.reasons },
    });
    await sendJobModerationEmail({
      companyId: params.companyId,
      jobId: job.id,
      title: params.input.title,
      decision: "blocked",
      reasons: decision.reasons,
    });
    return { id: job.id, status: "rejected", reasons: decision.reasons };
  }

  const allowance = internship ? null : await assertCanSubmit(params.companyId);
  const internshipQuota = internship
    ? await getInternshipQuota(params.companyId)
    : null;
  const result = await db.transaction(async (tx) => {
    const freeUsed = allowance
      ? await claimFreeJobCredit(tx, params.companyId, allowance.limit)
      : null;
    const internshipClaimed = internship
      ? await claimInternshipSlot(tx, params.companyId, internshipQuota!.freeLimit)
      : null;
    const [job] = await tx
      .insert(jobs)
      .values({
        ...jobValuesForInsert(params.companyId, params.userId, params.input),
        status: "pending_approval",
        moderationNotes: decision.reasons.length ? decision.reasons.join("\n") : null,
        quotaPeriodKey: quotaPeriodKey(),
      })
      .returning({ id: jobs.id });
    if (!job) throw new AppError("Could not create the job post.", 500);
    return { id: job.id, freeUsed, internshipClaimed };
  });
  let finalStatus: JobSubmissionResult["status"] = "pending_approval";
  if (decision.status === "published") {
    await publishJob({ id: result.id }, { role: "system" });
    finalStatus = "published";
    await sendJobPublishedEmail(params.companyId, result.id, params.input.title);
  } else {
    await sendJobModerationEmail({
      companyId: params.companyId,
      jobId: result.id,
      title: params.input.title,
      decision: "held",
      reasons: decision.reasons,
    });
  }
  if (result.freeUsed !== null) {
    await notifyFreeJobCreditUsage(
      params.companyId,
      result.freeUsed,
      allowance!.limit,
      allowance!.warningThreshold,
    );
  }
  return { id: result.id, status: finalStatus, reasons: decision.reasons };
}

/** Submits an existing draft or scan-blocked job through the moderation path. */
export async function submitCompanyJob(
  userId: string,
  companyId: string,
  jobId: string,
): Promise<JobSubmissionResult> {
  const job = await getCompanyJob(userId, companyId, jobId);
  if (job.status !== "draft" && job.status !== "rejected") {
    throw new AppError(
      "Only draft or rejected jobs can be submitted for approval.",
      409,
      "invalid_status",
    );
  }
  await assertCompanyApproved(companyId);
  const internship = job.jobType === "internship";
  if (internship) {
    await assertInternshipQuotaAvailable(companyId);
  } else {
    await assertJobQuotaAvailable(companyId);
  }
  const scan = await scanCompanyJob(companyId, {
    title: job.title,
    description: job.description,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    jobType: job.jobType,
    salaryMinPaise: job.salaryMinPaise,
    salaryMaxPaise: job.salaryMaxPaise,
    salaryPeriod: job.salaryPeriod,
    stipendType: job.stipendType,
    stipendMinPaise: job.stipendMinPaise,
    stipendMaxPaise: job.stipendMaxPaise,
    experienceMinYears: job.experienceMinYears,
    experienceMaxYears: job.experienceMaxYears,
  }, job.id);
  const decision = resolveJobScanDecision(scan, (await getSiteSettings()).autoPublishJobs);
  if (decision.status === "rejected") {
    await db.transaction(async (tx) => {
      await tx
        .update(jobs)
        .set({
          status: "rejected",
          moderationNotes: decision.reasons.join("\n"),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
      await tx.insert(auditLogs).values({
        actorRole: "system",
        action: "job.auto_blocked",
        entityType: "job",
        entityId: jobId,
        description: `The safety scan blocked "${job.title}".`,
        metadata: { score: scan.score, reasons: decision.reasons },
      });
    });
    await sendJobModerationEmail({
      companyId,
      jobId,
      title: job.title,
      decision: "blocked",
      reasons: decision.reasons,
    });
    return { id: jobId, status: "rejected", reasons: decision.reasons };
  }

  const allowance = internship ? null : await assertCanSubmit(companyId);
  const internshipQuota = internship
    ? await getInternshipQuota(companyId)
    : null;
  const freeUsed = await db.transaction(async (tx) => {
    const consumed = allowance
      ? allowance.usesFreeCredit
        ? await claimFreeJobCredit(tx, companyId, allowance.limit)
        : null
      : internship
        ? await claimInternshipSlot(tx, companyId, internshipQuota!.freeLimit)
        : null;
    await tx
      .update(jobs)
      .set({
        status: "pending_approval",
        moderationNotes: decision.reasons.length ? decision.reasons.join("\n") : null,
        quotaPeriodKey: quotaPeriodKey(),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    return consumed;
  });
  let finalStatus: JobSubmissionResult["status"] = "pending_approval";
  if (decision.status === "published") {
    await publishJob({ id: jobId }, { role: "system" });
    finalStatus = "published";
    await sendJobPublishedEmail(companyId, jobId, job.title);
  } else {
    await sendJobModerationEmail({
      companyId,
      jobId,
      title: job.title,
      decision: "held",
      reasons: decision.reasons,
    });
  }
  if (freeUsed !== null && allowance) {
    await notifyFreeJobCreditUsage(
      companyId,
      freeUsed,
      allowance.limit,
      allowance.warningThreshold,
    );
  }
  return { id: jobId, status: finalStatus, reasons: decision.reasons };
}

type SubmissionAllowance = {
  status: "pending_approval";
  usesFreeCredit: boolean;
  limit: number;
  warningThreshold: number;
};

async function assertCanSubmit(companyId: string): Promise<SubmissionAllowance> {
  await assertCompanyApproved(companyId);

  const decision = await checkJobQuota(companyId);
  if (!decision.allowed) {
    throw new AppError(decision.reason, 403, "quota_exceeded");
  }
  return {
    status: "pending_approval",
    usesFreeCredit: decision.quota.usesFreeCredit,
    limit: decision.quota.limit ?? 0,
    warningThreshold: decision.quota.warningThreshold,
  };
}

async function assertJobQuotaAvailable(companyId: string): Promise<void> {
  const decision = await checkJobQuota(companyId);
  if (!decision.allowed) {
    throw new AppError(decision.reason, 403, "quota_exceeded");
  }
}

async function assertInternshipQuotaAvailable(companyId: string): Promise<void> {
  const decision = await checkInternshipQuota(companyId);
  if (!decision.allowed) {
    throw new AppError(decision.reason ?? "Internship quota exceeded.", 403, "quota_exceeded");
  }
}

async function claimInternshipSlot(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: string,
  freeLimit: number,
): Promise<null> {
  const freeRows = await tx
    .update(companies)
    .set({
      freeInternshipPostsUsed: sql`${companies.freeInternshipPostsUsed} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(companies.id, companyId),
        eq(companies.status, "approved"),
        sql`${companies.freeInternshipPostsUsed} < ${freeLimit}`,
      ),
    )
    .returning({ id: companies.id });
  if (freeRows[0]) return null;

  const creditRows = await tx
    .update(companies)
    .set({
      internshipPostCredits: sql`greatest(${companies.internshipPostCredits} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(companies.id, companyId), sql`${companies.internshipPostCredits} > 0`),
    )
    .returning({ internshipPostCredits: companies.internshipPostCredits });
  if (!creditRows[0]) {
    throw new AppError(
      "Your company has used all its free internship posts. Buy internship credits to post another internship.",
      403,
      "quota_exceeded",
    );
  }
  return null;
}

async function assertCompanyApproved(companyId: string): Promise<void> {
  const companyRows = await db
    .select({ status: companies.status })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (companyRows.at(0)?.status !== "approved") {
    throw new AppError(
      "Your company must be approved before jobs can be submitted. Upload your verification documents first.",
      403,
      "company_not_approved",
    );
  }
}

async function scanCompanyJob(
  companyId: string,
  input: JobFormInput | JobScanInput,
  exceptJobId?: string,
): Promise<JobScanResult> {
  const conditions = [
    eq(jobs.companyId, companyId),
    isNull(jobs.deletedAt),
    sql`${jobs.status} <> 'draft'`,
    or(
      sql`lower(${jobs.title}) = lower(${input.title})`,
      sql`similarity(${jobs.description}, ${input.description}) > 0.85`,
    ),
  ];
  if (exceptJobId) conditions.push(ne(jobs.id, exceptJobId));
  const duplicates = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(...conditions))
    .limit(1);
  return scanJob({
    title: input.title,
    description: input.description,
    responsibilities: input.responsibilities,
    requirements: input.requirements,
    jobType: input.jobType,
    stipendType: "stipendType" in input ? input.stipendType : null,
    stipendMinPaise: "stipendMinRupees" in input
      ? input.stipendMinRupees === null ? null : Math.round((input.stipendMinRupees ?? 0) * 100)
      : input.stipendMinPaise,
    stipendMaxPaise: "stipendMaxRupees" in input
      ? input.stipendMaxRupees === null ? null : Math.round((input.stipendMaxRupees ?? 0) * 100)
      : input.stipendMaxPaise,
    salaryMinPaise: "salaryMinRupees" in input
      ? input.salaryMinRupees === null ? null : Math.round((input.salaryMinRupees ?? 0) * 100)
      : input.salaryMinPaise,
    salaryMaxPaise: "salaryMaxRupees" in input
      ? input.salaryMaxRupees === null ? null : Math.round((input.salaryMaxRupees ?? 0) * 100)
      : input.salaryMaxPaise,
    salaryPeriod: input.salaryPeriod,
    experienceMinYears: input.experienceMinYears,
    experienceMaxYears: input.experienceMaxYears,
    duplicateByCompany: duplicates.length > 0,
  });
}

async function sendJobModerationEmail(params: {
  companyId: string;
  jobId: string;
  title: string;
  decision: "held" | "blocked";
  reasons: string[];
}): Promise<void> {
  try {
    const [company] = await db
      .select({ email: users.email, name: users.fullName })
      .from(companies)
      .innerJoin(users, eq(users.id, companies.ownerUserId))
      .where(eq(companies.id, params.companyId))
      .limit(1);
    if (!company) return;
    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: company.email,
      toName: company.name,
      templateKey: params.decision === "held" ? "job_held_for_review" : "job_auto_blocked",
      rendered: jobModerationDecisionEmail({
        recruiterName: company.name || company.email,
        jobTitle: params.title,
        decision: params.decision,
        reasons: params.reasons,
        editUrl: appUrl(`/recruiter/jobs/${params.jobId}`),
        brand,
      }),
      metadata: { companyId: params.companyId, jobId: params.jobId },
    });
  } catch (error) {
    console.error("[recruiter] could not queue job moderation email:", error);
  }
}

async function sendJobPublishedEmail(
  companyId: string,
  jobId: string,
  title: string,
): Promise<void> {
  try {
    const [company] = await db
      .select({ email: users.email, name: users.fullName, slug: jobs.slug })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(users, eq(users.id, companies.ownerUserId))
      .where(and(eq(jobs.id, jobId), eq(companies.id, companyId)))
      .limit(1);
    if (!company) return;
    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: company.email,
      toName: company.name,
      templateKey: "job_approved",
      rendered: jobApprovedEmail({
        recruiterName: company.name || company.email,
        jobTitle: title,
        jobUrl: appUrl(`/jobs/${company.slug}`),
        brand,
      }),
      metadata: { companyId, jobId },
    });
  } catch (error) {
    console.error("[recruiter] could not queue job published email:", error);
  }
}

async function claimFreeJobCredit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: string,
  limit: number,
): Promise<number> {
  const rows = await tx
    .update(companies)
    .set({
      freeJobPostsUsed: sql`${companies.freeJobPostsUsed} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(companies.id, companyId),
        eq(companies.status, "approved"),
        sql`${companies.freeJobPostsUsed} < ${limit}`,
      ),
    )
    .returning({ freeJobPostsUsed: companies.freeJobPostsUsed });
  if (!rows[0]) {
    throw new AppError(
      "Your company's free job-post credit has been used. Upgrade to a paid employer plan to post another job.",
      403,
      "quota_exceeded",
    );
  }
  return rows[0].freeJobPostsUsed;
}

async function notifyFreeJobCreditUsage(
  companyId: string,
  used: number,
  limit: number,
  warningThreshold: number,
): Promise<void> {
  const warningAt = Math.max(1, Math.ceil((limit * warningThreshold) / 100));
  if (used !== warningAt && used < limit) return;

  try {
    const [company] = await db
      .select({
        name: companies.name,
        ownerName: users.fullName,
        ownerEmail: users.email,
      })
      .from(companies)
      .innerJoin(users, eq(users.id, companies.ownerUserId))
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) return;
    const brand = await getEmailBrand();
    if (used === warningAt) {
      await queueRenderedEmail({
        to: company.ownerEmail,
        toName: company.ownerName,
        templateKey: "free_job_credit_warning",
        rendered: freeJobCreditWarningEmail({
          companyName: company.name,
          used,
          limit,
          upgradeUrl: appUrl("/pricing?audience=employer"),
          brand,
        }),
      });
    }
    if (used >= limit) {
      await queueRenderedEmail({
        to: company.ownerEmail,
        toName: company.ownerName,
        templateKey: "free_job_credit_limit_reached",
        rendered: freeJobCreditLimitReachedEmail({
          companyName: company.name,
          limit,
          upgradeUrl: appUrl("/pricing?audience=employer"),
          brand,
        }),
      });
    }
  } catch (error) {
    console.error("[recruiter] could not queue free job-post emails:", error);
  }
}

export type JobLifecycleAction = "pause" | "resume" | "close";

/** Recruiter-side lifecycle: pause / resume / close a published job. */
export async function changeJobLifecycle(
  userId: string,
  companyId: string,
  jobId: string,
  action: JobLifecycleAction,
): Promise<void> {
  const job = await getCompanyJob(userId, companyId, jobId);

  if (action === "pause") {
    if (job.status !== "published") {
      throw new AppError("Only a published job can be paused.", 409, "invalid_status");
    }
    await db.update(jobs).set({ status: "paused", updatedAt: new Date() }).where(eq(jobs.id, jobId));
    return;
  }

  if (action === "close") {
    if (job.status !== "published" && job.status !== "paused") {
      throw new AppError("Only a live job can be closed.", 409, "invalid_status");
    }
    await db.update(jobs).set({ status: "closed", updatedAt: new Date() }).where(eq(jobs.id, jobId));
    return;
  }

  // resume
  if (job.status !== "paused") {
    throw new AppError("Only a paused job can be resumed.", 409, "invalid_status");
  }

  const currentKey = quotaPeriodKey();
  if (job.quotaPeriodKey !== currentKey) {
    // Resuming in a later month consumes that month's quota.
    const decision = await checkJobQuota(companyId);
    if (!decision.allowed) {
      throw new AppError(decision.reason, 403, "quota_exceeded");
    }
  }
  await publishJob(
    { id: jobId, quotaPeriodKey: currentKey },
    { role: "recruiter", userId },
  );
}

/* -------------------------------------------------------------------------- */
/* Applicant pipeline                                                         */
/* -------------------------------------------------------------------------- */

export type PipelineRow = {
  id: string;
  status: string;
  coverNote: string | null;
  createdAt: Date;
  statusChangedAt: Date;
  jobId: string;
  jobTitle: string;
  jobSlug: string;
  candidateUserId: string;
  candidateName: string;
  headline: string | null;
  location: string | null;
  resumeId: string | null;
  isPremium: boolean;
};

export async function listCompanyApplications(params: {
  companyId: string;
  jobId?: string | undefined;
  status?: string | undefined;
  limit?: number | undefined;
  /** Newest applications first (dashboard board). Default keeps Premium-first. */
  recentFirst?: boolean | undefined;
}): Promise<PipelineRow[]> {
  const conditions = [eq(jobs.companyId, params.companyId)];
  if (params.jobId) conditions.push(eq(jobs.id, params.jobId));
  if (params.status) {
    conditions.push(eq(applications.status, params.status as never));
  }

  return db
    .select({
      id: applications.id,
      status: applications.status,
      coverNote: applications.coverNote,
      createdAt: applications.createdAt,
      statusChangedAt: applications.statusChangedAt,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobSlug: jobs.slug,
      candidateUserId: users.id,
      candidateName: users.fullName,
      headline: candidateProfiles.headline,
      location: candidateProfiles.currentLocation,
      resumeId: applications.resumeId,
      isPremium: activeCandidatePremiumSql(users.id),
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(users, eq(users.id, applications.candidateUserId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
    .where(and(...conditions))
    .orderBy(
      ...(params.recentFirst
        ? [desc(applications.createdAt)]
        : [
            desc(activeCandidatePremiumSql(users.id)),
            desc(applications.createdAt),
          ]),
    )
    .limit(params.limit ?? 300);
}

export async function countApplicationsByStatus(
  companyId: string,
): Promise<Array<{ status: string; value: number }>> {
  return db
    .select({ status: applications.status, value: count() })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(jobs.companyId, companyId))
    .groupBy(applications.status);
}

/** Jobs the company can filter the pipeline by. */
export async function listJobOptions(
  companyId: string,
): Promise<Array<{ id: string; title: string }>> {
  return db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), isNull(jobs.deletedAt)))
    .orderBy(desc(jobs.createdAt))
    .limit(200);
}

/** The application row plus its job's company, for status changes. */
export async function getApplicationCompany(applicationId: string): Promise<{
  applicationId: string;
  companyId: string;
} | null> {
  const rows = await db
    .select({ applicationId: applications.id, companyId: jobs.companyId })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.id, applicationId))
    .limit(1);
  return rows.at(0) ?? null;
}

/** Updates job content. Publishing state is untouched - use lifecycle/submit. */
export async function updateCompanyJob(params: {
  userId: string;
  companyId: string;
  jobId: string;
  input: JobFormInput;
}): Promise<void> {
  const job = await getCompanyJob(params.userId, params.companyId, params.jobId);
  if (job.status === "closed" || job.status === "expired") {
    throw new AppError("This job is closed and can no longer be edited.", 409, "invalid_status");
  }

  await db
    .update(jobs)
    .set({
      title: params.input.title.trim(),
      description: params.input.description.trim(),
      responsibilities: params.input.responsibilities?.trim() || null,
      requirements: params.input.requirements?.trim() || null,
      categoryId: params.input.categoryId,
      jobType: params.input.jobType as never,
      workMode: params.input.workMode as never,
      city: params.input.city?.trim() || null,
      state: params.input.state?.trim() || null,
      salaryMinPaise:
        params.input.salaryMinRupees === null
          ? null
          : Math.round(params.input.salaryMinRupees * 100),
      salaryMaxPaise:
        params.input.salaryMaxRupees === null
          ? null
          : Math.round(params.input.salaryMaxRupees * 100),
      salaryPeriod: params.input.salaryPeriod as never,
      salaryHidden: params.input.salaryHidden,
      experienceMinYears:
        params.input.experienceMinYears === null
          ? null
          : String(params.input.experienceMinYears),
      experienceMaxYears:
        params.input.experienceMaxYears === null
          ? null
          : String(params.input.experienceMaxYears),
      stipendType: params.input.stipendType as never,
      stipendMinPaise:
        params.input.stipendMinRupees === null
          ? null
          : Math.round(params.input.stipendMinRupees * 100),
      stipendMaxPaise:
        params.input.stipendMaxRupees === null
          ? null
          : Math.round(params.input.stipendMaxRupees * 100),
      durationMonths: params.input.durationMonths,
      startDate: params.input.startDate,
      eligibility: params.input.eligibility?.trim() || null,
      ppoPossible: params.input.ppoPossible,
      certificateProvided: params.input.certificateProvided,
      openings: params.input.openings,
      deadline: params.input.deadline,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, params.jobId));
}
