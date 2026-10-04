"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { builtResumeVersions, builtResumes, users } from "@/lib/db/schema";
import { getCandidateEntitlements } from "@/lib/entitlements";
import { AppError, NotFoundError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { deleteStoredFile, storeValidatedFile } from "@/lib/storage";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import { renderBuiltResumePdf, type ResumeTemplate } from "./resume-pdf";

const resumeIdSchema = z.uuid();
const resumeSchema = z.object({
  resumeId: z.union([z.literal(""), z.uuid()]),
  title: z.string().trim().min(1).max(120),
  template: z.enum(["classic", "modern", "minimal"]),
  data: z.object({
    fullName: z.string().trim().max(120),
    email: z.union([z.string().trim().max(254).email(), z.literal("")]),
    phone: z.string().trim().max(40),
    location: z.string().trim().max(160),
    headline: z.string().trim().max(160),
    summary: z.string().trim().max(3000),
    experience: z.string().trim().max(8000),
    education: z.string().trim().max(5000),
    skills: z.string().trim().max(2000),
  }),
});

function inputValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function parseResumeForm(formData: FormData) {
  return resumeSchema.safeParse({
    resumeId: inputValue(formData, "resumeId"),
    title: inputValue(formData, "title"),
    template: inputValue(formData, "template"),
    data: {
      fullName: inputValue(formData, "fullName"),
      email: inputValue(formData, "email"),
      phone: inputValue(formData, "phone"),
      location: inputValue(formData, "location"),
      headline: inputValue(formData, "headline"),
      summary: inputValue(formData, "summary"),
      experience: inputValue(formData, "experience"),
      education: inputValue(formData, "education"),
      skills: inputValue(formData, "skills"),
    },
  });
}

export async function saveBuiltResumeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    assertCandidate(user.role);
    const parsed = parseResumeForm(formData);
    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Check the resume fields.");
    }

    const { resumeId, title, data } = parsed.data;
    const features = await getCandidateEntitlements(user.id);
    const premium = features.get("resume_builder")?.enabled === true;
    const templateFeature = features.get("resume_templates");
    const versionFeature = features.get("resume_versions");
    const templateLimit = templateFeature?.limit ?? 1;
    const versionLimit = versionFeature?.limit ?? null;
    if (!premium && !templateFeature?.enabled) {
      throw new AppError("Resume Builder is not available on your plan.", 403, "feature_not_in_plan");
    }
    if (premium && !templateFeature?.enabled) {
      throw new AppError("Resume templates are not available on your plan.", 403, "feature_not_in_plan");
    }
    if (premium && !versionFeature?.enabled) {
      throw new AppError("Resume version history is not available on your plan.", 403, "feature_not_in_plan");
    }
    if (resumeId === "" && (!templateFeature?.enabled || templateLimit === 0)) {
      throw new AppError("Resume Builder is not available on your plan.", 403, "feature_not_in_plan");
    }
    const professionalTemplates =
      premium &&
      templateFeature?.enabled === true &&
      (templateFeature.limit === null || templateFeature.limit > 1);
    if (!professionalTemplates && parsed.data.template !== "classic") {
      throw new AppError("Upgrade your plan to use professional templates.", 403, "feature_not_in_plan");
    }

    let resumeToSave: typeof builtResumes.$inferSelect | undefined;
    const obsoletePdfPaths: string[] = [];
    await db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
      if (resumeId) {
        const existing = await tx
          .select()
          .from(builtResumes)
          .where(
            and(
              eq(builtResumes.id, resumeId),
              eq(builtResumes.userId, user.id),
              isNull(builtResumes.deletedAt),
            ),
          )
          .limit(1);
        resumeToSave = existing[0];
        if (!resumeToSave) throw new NotFoundError("Resume not found.");
      } else {
        const existing = await tx
          .select({ id: builtResumes.id })
          .from(builtResumes)
          .where(and(eq(builtResumes.userId, user.id), isNull(builtResumes.deletedAt)));
        if (!premium && existing.length >= templateLimit) {
          throw new AppError("The free plan includes one basic resume. Upgrade to create more.", 403, "resume_limit_reached");
        }
      }

      const chosenTemplate: ResumeTemplate = premium ? parsed.data.template : "classic";
      const now = new Date();
      if (resumeToSave) {
        const updated = await tx
          .update(builtResumes)
          .set({
            title,
            templateKey: chosenTemplate,
            data: { ...data },
            currentVersion: resumeToSave.currentVersion + (premium ? 1 : 0),
            updatedAt: now,
          })
          .where(eq(builtResumes.id, resumeToSave.id))
          .returning();
        resumeToSave = updated[0];
      } else {
        const inserted = await tx
          .insert(builtResumes)
          .values({
            userId: user.id,
            title,
            templateKey: chosenTemplate,
            data: { ...data },
            isPrimary: (await tx.select({ id: builtResumes.id }).from(builtResumes)
              .where(and(eq(builtResumes.userId, user.id), isNull(builtResumes.deletedAt)))).length === 0,
          })
          .returning();
        resumeToSave = inserted[0];
      }

      if (!resumeToSave) throw new Error("Resume was not saved.");
      const currentVersion = resumeToSave.currentVersion;
      if (premium) {
        if (versionLimit !== null && versionLimit < 1) {
          throw new AppError("Your plan does not allow saved resume versions.", 403, "resume_versions_unavailable");
        }
        const pdf = await renderBuiltResumePdf(title, chosenTemplate, data);
        const stored = await storeValidatedFile("built-resumes", pdf, "application/pdf");
        await tx.insert(builtResumeVersions).values({
          builtResumeId: resumeToSave.id,
          version: currentVersion,
          data: { ...data },
          pdfPath: stored.storagePath,
        });
        if (versionLimit !== null) {
          const allVersions = await tx
            .select({ id: builtResumeVersions.id, pdfPath: builtResumeVersions.pdfPath })
            .from(builtResumeVersions)
            .where(eq(builtResumeVersions.builtResumeId, resumeToSave.id))
            .orderBy(desc(builtResumeVersions.version));
          const expiredVersions = allVersions.slice(versionLimit);
          for (const expired of expiredVersions) {
            if (expired.pdfPath) obsoletePdfPaths.push(expired.pdfPath);
            await tx.delete(builtResumeVersions).where(eq(builtResumeVersions.id, expired.id));
          }
        }
      } else {
        const prior = await tx
          .select({ id: builtResumeVersions.id })
          .from(builtResumeVersions)
          .where(eq(builtResumeVersions.builtResumeId, resumeToSave.id))
          .limit(1);
        if (prior[0]) {
          await tx
            .update(builtResumeVersions)
            .set({ data: { ...data }, pdfPath: null })
            .where(eq(builtResumeVersions.id, prior[0].id));
        } else {
          await tx.insert(builtResumeVersions).values({
            builtResumeId: resumeToSave.id,
            version: 1,
            data: { ...data },
            pdfPath: null,
          });
        }
      }
      if (resumeToSave.isPrimary) {
        await tx
          .update(builtResumes)
          .set({ isPrimary: false })
          .where(and(eq(builtResumes.userId, user.id), isNull(builtResumes.deletedAt), eq(builtResumes.isPrimary, true)));
        await tx.update(builtResumes).set({ isPrimary: true }).where(eq(builtResumes.id, resumeToSave.id));
      }
    });

    await Promise.all(obsoletePdfPaths.map(deleteStoredFile));
    revalidatePath("/dashboard/resumes");
    revalidatePath("/dashboard/resume-builder");
    return formSuccess("Resume saved.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[resume-builder] save failed:", error);
    return formError("We could not save this resume. Please try again.");
  }
}

export async function deleteBuiltResumeAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  assertCandidate(user.role);
  const resumeId = resumeIdSchema.parse(formData.get("resumeId"));
  const result = await db
    .update(builtResumes)
    .set({ deletedAt: new Date(), isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(builtResumes.id, resumeId),
        eq(builtResumes.userId, user.id),
        isNull(builtResumes.deletedAt),
      ),
    )
    .returning({ id: builtResumes.id });
  if (result.length === 0) throw new NotFoundError("Resume not found.");
  revalidatePath("/dashboard/resumes");
  revalidatePath("/dashboard/resume-builder");
}

export async function setPrimaryBuiltResumeAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  assertCandidate(user.role);
  const resumeId = resumeIdSchema.parse(formData.get("resumeId"));
  const owned = await db
    .select({ id: builtResumes.id })
    .from(builtResumes)
    .where(
      and(
        eq(builtResumes.id, resumeId),
        eq(builtResumes.userId, user.id),
        isNull(builtResumes.deletedAt),
      ),
    )
    .limit(1);
  if (!owned[0]) throw new NotFoundError("Resume not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(builtResumes)
      .set({ isPrimary: false })
      .where(and(eq(builtResumes.userId, user.id), isNull(builtResumes.deletedAt)));
    await tx.update(builtResumes).set({ isPrimary: true }).where(eq(builtResumes.id, resumeId));
  });
  revalidatePath("/dashboard/resumes");
  revalidatePath("/dashboard/resume-builder");
}

function assertCandidate(role: string): void {
  if (role !== "job_seeker") {
    throw new AppError("Only candidate accounts can manage built resumes.", 403, "candidate_only");
  }
}
