"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { db } from "@/lib/db";
import { candidateProfiles } from "@/lib/db/schema";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import {
  computeCompleteness,
  ensureCandidateProfile,
} from "./profile";
import {
  deleteResume,
  setDefaultResume,
  uploadResume,
} from "./resumes";

const RESUME_ID = z.uuid();

export async function uploadResumeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();

    const file = formData.get("resume");
    if (!(file instanceof File) || file.size === 0) {
      return formError("Choose a PDF, DOC or DOCX file to upload.");
    }

    const label = String(formData.get("label") ?? "").trim() || null;
    await uploadResume(user.id, file, label);

    revalidatePath("/dashboard/resumes");
    return formSuccess("Resume uploaded.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[resumes] upload failed:", error);
    return formError("We could not upload that resume. Please try again.");
  }
}

export async function setDefaultResumeAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  await setDefaultResume(user.id, RESUME_ID.parse(formData.get("resumeId")));
  revalidatePath("/dashboard/resumes");
}

export async function deleteResumeAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  await deleteResume(user.id, RESUME_ID.parse(formData.get("resumeId")));
  revalidatePath("/dashboard/resumes");
}

const profileSchema = z.object({
  headline: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(4000).optional(),
  currentLocation: z.string().trim().max(160).optional(),
  currentCompany: z.string().trim().max(160).optional(),
  currentDesignation: z.string().trim().max(160).optional(),
  totalExperienceMonths: z.number().int().min(0).max(900).optional(),
  noticePeriodDays: z.number().int().min(0).max(365).optional(),
  expectedSalaryLpa: z.number().min(0).max(10_000).optional(),
  preferredLocations: z.array(z.string().trim().min(1).max(80)).max(10),
  discoverable: z.boolean(),
});

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();

    const parsed = profileSchema.safeParse({
      headline: str(formData, "headline"),
      summary: str(formData, "summary"),
      currentLocation: str(formData, "currentLocation"),
      currentCompany: str(formData, "currentCompany"),
      currentDesignation: str(formData, "currentDesignation"),
      totalExperienceMonths: optionalNumber(formData, "totalExperienceMonths"),
      noticePeriodDays: optionalNumber(formData, "noticePeriodDays"),
      expectedSalaryLpa: optionalNumber(formData, "expectedSalaryLpa"),
      preferredLocations: str(formData, "preferredLocations")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
      discoverable: formData.get("discoverable") === "on",
    });

    if (!parsed.success) {
      return formError(
        parsed.error.issues[0]?.message ?? "Please check the form and try again.",
      );
    }

    const data = parsed.data;
    const profileId = await ensureCandidateProfile(user.id);

    await db
      .update(candidateProfiles)
      .set({
        headline: data.headline || null,
        summary: data.summary || null,
        currentLocation: data.currentLocation || null,
        currentCompany: data.currentCompany || null,
        currentDesignation: data.currentDesignation || null,
        totalExperienceMonths: data.totalExperienceMonths ?? null,
        noticePeriodDays: data.noticePeriodDays ?? null,
        // Stored in paise; the form collects lakhs per annum.
        expectedSalaryPaise:
          data.expectedSalaryLpa === undefined
            ? null
            : Math.round(data.expectedSalaryLpa * 100 * 100_000),
        preferredLocations: data.preferredLocations,
        discoverable: data.discoverable,
        updatedAt: new Date(),
      })
      .where(eq(candidateProfiles.id, profileId));

    const completeness = await computeCompleteness(user.id);
    await db
      .update(candidateProfiles)
      .set({ profileCompleteness: completeness })
      .where(eq(candidateProfiles.id, profileId));

    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard");
    return formSuccess("Profile saved.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[profile] update failed:", error);
    return formError("We could not save your profile. Please try again.");
  }
}

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(formData: FormData, key: string): number | undefined {
  const raw = str(formData, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}