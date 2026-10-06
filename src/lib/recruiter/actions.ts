"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin, getRequestIp } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { enforceRateLimit, RATE_LIMITS, rateKey } from "@/lib/rate-limit";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import { changeApplicationStatus } from "@/lib/applications/service";
import {
  changeJobLifecycle,
  createCompanyForUser,
  createCompanyJob,
  getApplicationCompany,
  submitCompanyJob,
  submitVerificationDocument,
  updateCompanyJob,
  updateCompanyProfile,
  type JobFormInput,
  type JobLifecycleAction,
} from "./service";
import { requireCompanyMembership } from "@/lib/entitlements";

/* -------------------------------------------------------------------------- */
/* Company                                                                    */
/* -------------------------------------------------------------------------- */

const locationsFrom = (raw: string): string[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);

const companySchema = z.object({
  companyId: z.uuid("Company not found."),
  name: z.string().trim().min(2, "Company name is too short.").max(160),
  about: z.string().trim().max(5000).optional(),
  industry: z.string().trim().max(120).optional(),
  size: z.string().trim().max(10).optional(),
  website: z.string().trim().max(300).optional(),
  foundedYear: z.coerce.number().int().min(1800).max(2100).optional().or(z.literal("")),
  headquarters: z.string().trim().max(200).optional(),
  locations: z.string().trim().max(600).optional(),
  contactEmail: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")),
  contactPhone: z.string().trim().max(30).optional(),
});

function parseCompany(formData: FormData) {
  return companySchema.safeParse({
    companyId: formData.get("companyId"),
    name: formData.get("name"),
    about: formData.get("about") ?? "",
    industry: formData.get("industry") ?? "",
    size: formData.get("size") ?? "",
    website: formData.get("website") ?? "",
    foundedYear: formData.get("foundedYear") ?? "",
    headquarters: formData.get("headquarters") ?? "",
    locations: formData.get("locations") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
  });
}

export async function updateCompanyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    const parsed = parseCompany(formData);
    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Invalid company profile.");
    }
    const d = parsed.data;
    await updateCompanyProfile(user.id, d.companyId, {
      name: d.name,
      about: d.about || null,
      industry: d.industry || null,
      size: d.size || null,
      website: d.website || null,
      foundedYear: typeof d.foundedYear === "number" ? d.foundedYear : null,
      headquarters: d.headquarters || null,
      locations: locationsFrom(d.locations ?? ""),
      contactEmail: d.contactEmail || null,
      contactPhone: d.contactPhone || null,
    });
    revalidatePath("/recruiter/company");
    return formSuccess("Company profile updated.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[recruiter] company update failed:", error);
    return formError("We could not save the company profile. Please try again.");
  }
}

export async function createCompanyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    const ip = (await getRequestIp()) ?? "unknown";
    await enforceRateLimit(rateKey("companyRegister", ip), RATE_LIMITS.companyRegister);
    const name = String(formData.get("name") ?? "").trim();
    const website = String(formData.get("website") ?? "").trim();
    const contactPhone = String(formData.get("contactPhone") ?? "").trim();
    await createCompanyForUser(user.id, name, website || null, contactPhone || null);
    revalidatePath("/recruiter/company");
    return formSuccess("Company created. Complete your profile and submit verification.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[recruiter] company create failed:", error);
    return formError("We could not create the company. Please try again.");
  }
}

export async function uploadVerificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    const companyId = z.uuid().parse(formData.get("companyId"));
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) {
      return formError("Choose a PDF, PNG or JPG document to upload.");
    }
    await submitVerificationDocument({
      userId: user.id,
      companyId,
      file,
      docType: String(formData.get("docType") ?? "company_registration"),
    });
    revalidatePath("/recruiter/company");
    return formSuccess("Document uploaded. Your company is queued for review.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[recruiter] verification upload failed:", error);
    return formError("We could not upload the document. Please try again.");
  }
}

/* -------------------------------------------------------------------------- */
/* Jobs                                                                       */
/* -------------------------------------------------------------------------- */

const jobSchema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters.").max(150),
  description: z
    .string()
    .trim()
    .min(40, "Add a fuller description (at least 40 characters).")
    .max(20000),
  responsibilities: z.string().trim().max(8000).optional(),
  requirements: z.string().trim().max(8000).optional(),
  categoryId: z.string().trim().optional(),
  jobType: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "freelance"]),
  workMode: z.enum(["remote", "hybrid", "onsite"]),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  salaryMinRupees: z.coerce.number().min(0).max(1_000_000_000).optional().or(z.literal("")),
  salaryMaxRupees: z.coerce.number().min(0).max(1_000_000_000).optional().or(z.literal("")),
  salaryPeriod: z.enum(["year", "month", "day", "hour"]),
  salaryHidden: z.boolean(),
  experienceMinYears: z.coerce.number().min(0).max(50).optional().or(z.literal("")),
  experienceMaxYears: z.coerce.number().min(0).max(50).optional().or(z.literal("")),
  openings: z.coerce.number().int().min(1).max(500),
  deadline: z.string().optional(),
});

function parseJob(formData: FormData) {
  return jobSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    responsibilities: String(formData.get("responsibilities") ?? "").trim() || undefined,
    requirements: String(formData.get("requirements") ?? "").trim() || undefined,
    categoryId: String(formData.get("categoryId") ?? "").trim(),
    jobType: formData.get("jobType"),
    workMode: formData.get("workMode"),
    city: String(formData.get("city") ?? "").trim() || undefined,
    state: String(formData.get("state") ?? "").trim() || undefined,
    salaryMinRupees: formData.get("salaryMinRupees") ?? "",
    salaryMaxRupees: formData.get("salaryMaxRupees") ?? "",
    salaryPeriod: formData.get("salaryPeriod") ?? "year",
    salaryHidden: formData.get("salaryHidden") === "on",
    experienceMinYears: formData.get("experienceMinYears") ?? "",
    experienceMaxYears: formData.get("experienceMaxYears") ?? "",
    openings: formData.get("openings") ?? "1",
    deadline: String(formData.get("deadline") ?? "").trim(),
  });
}

function jobInputFrom(d: z.infer<typeof jobSchema>): JobFormInput {
  return {
    title: d.title,
    description: d.description,
    responsibilities: d.responsibilities ?? null,
    requirements: d.requirements ?? null,
    categoryId: d.categoryId || null,
    jobType: d.jobType,
    workMode: d.workMode,
    city: d.city ?? null,
    state: d.state ?? null,
    salaryMinRupees: typeof d.salaryMinRupees === "number" ? d.salaryMinRupees : null,
    salaryMaxRupees: typeof d.salaryMaxRupees === "number" ? d.salaryMaxRupees : null,
    salaryPeriod: d.salaryPeriod,
    salaryHidden: d.salaryHidden,
    experienceMinYears:
      typeof d.experienceMinYears === "number" ? d.experienceMinYears : null,
    experienceMaxYears:
      typeof d.experienceMaxYears === "number" ? d.experienceMaxYears : null,
    openings: d.openings,
    deadline: d.deadline ? new Date(`${d.deadline}T23:59:59+05:30`) : null,
  };
}

function jobFormValues(formData: FormData): Record<string, string> {
  const keep = [
    "title",
    "description",
    "responsibilities",
    "requirements",
    "city",
    "state",
    "salaryMinRupees",
    "salaryMaxRupees",
    "experienceMinYears",
    "experienceMaxYears",
  ];
  const values: Record<string, string> = {};
  for (const key of keep) {
    values[key] = String(formData.get(key) ?? "");
  }
  return values;
}

export async function saveJobAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    const companyId = z.uuid("Company not found.").parse(formData.get("companyId"));
    const submit = formData.get("intent") === "submit";
    const jobIdRaw = String(formData.get("jobId") ?? "").trim();

    const parsed = parseJob(formData);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        status: "error",
        message: issue?.message ?? "Please review the job details.",
        ...(issue
          ? { fieldErrors: { [String(issue.path[0] ?? "form")]: issue.message } }
          : {}),
        values: jobFormValues(formData),
      };
    }

    if (jobIdRaw) {
      await updateCompanyJob({
        userId: user.id,
        companyId,
        jobId: z.uuid("Job not found.").parse(jobIdRaw),
        input: jobInputFrom(parsed.data),
      });
      revalidatePath("/recruiter/jobs");
      return formSuccess("Job updated.");
    }

    const result = await createCompanyJob({
      userId: user.id,
      companyId,
      input: jobInputFrom(parsed.data),
      submit,
    });

    revalidatePath("/recruiter/jobs");
    if (!submit) return formSuccess("Draft saved.");
    if (result.status === "published") return formSuccess("Your job is now live.");
    if (result.status === "rejected") {
      return formError(`The safety scan blocked this job: ${result.reasons.join(" ")}`);
    }
    return formSuccess(
      `Your job is under review. ${result.reasons.join(" ")}`.trim(),
    );
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[recruiter] job save failed:", error);
    return formError("We could not save the job. Please try again.");
  }
}

const jobIdSchema = z.object({
  jobId: z.uuid("Job not found."),
  companyId: z.uuid("Company not found."),
});

export async function submitJobAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const parsed = jobIdSchema.safeParse({
    jobId: formData.get("jobId"),
    companyId: formData.get("companyId"),
  });
  if (!parsed.success) throw new AppError("Job not found.", 404, "not_found");
  try {
    await submitCompanyJob(user.id, parsed.data.companyId, parsed.data.jobId);
  } finally {
    revalidatePath("/recruiter/jobs");
  }
}

const lifecycleSchema = jobIdSchema.extend({
  action: z.enum(["pause", "resume", "close"]),
});

export async function jobLifecycleAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const parsed = lifecycleSchema.safeParse({
    jobId: formData.get("jobId"),
    companyId: formData.get("companyId"),
    action: formData.get("action"),
  });
  if (!parsed.success) {
    throw new AppError("Invalid job action.", 400, "invalid_action");
  }
  try {
    await changeJobLifecycle(
      user.id,
      parsed.data.companyId,
      parsed.data.jobId,
      parsed.data.action as JobLifecycleAction,
    );
  } finally {
    revalidatePath("/recruiter/jobs");
  }
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

const statusSchema = z.object({
  applicationId: z.uuid("Application not found."),
  status: z.enum(["viewed", "shortlisted", "interview", "offered", "hired", "rejected"]),
  note: z.string().trim().max(1000).optional(),
});

export async function changeApplicationStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    const parsed = statusSchema.safeParse({
      applicationId: formData.get("applicationId"),
      status: formData.get("status"),
      note: String(formData.get("note") ?? "").trim() || undefined,
    });
    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Invalid status.");
    }

    const owned = await getApplicationCompany(parsed.data.applicationId);
    if (!owned) return formError("Application not found.");

    await changeApplicationStatus({
      applicationId: parsed.data.applicationId,
      newStatus: parsed.data.status,
      recruiterUserId: user.id,
      note: parsed.data.note ?? null,
      assertMembership: async () => {
        await requireCompanyMembership(user.id, owned.companyId);
      },
    });

    revalidatePath("/recruiter/applications");
    return formSuccess("Application updated. The candidate has been notified.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[recruiter] status change failed:", error);
    return formError("We could not update the application. Please try again.");
  }
}
