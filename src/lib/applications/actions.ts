"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiUser, requireApiVerifiedUser } from "@/lib/auth/current-user";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import {
  applyToJob,
  toggleSavedJob,
  withdrawApplication,
} from "./service";

const applySchema = z.object({
  jobId: z.uuid("Invalid job."),
  resumeId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? z.uuid().parse(v) : null)),
  coverNote: z
    .string()
    .trim()
    .max(2000, "Cover note is too long.")
    .optional(),
});

export async function applyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();

    const parsed = applySchema.safeParse({
      jobId: formData.get("jobId"),
      resumeId: formData.get("resumeId") ?? undefined,
      coverNote: formData.get("coverNote") ?? undefined,
    });

    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Invalid application.");
    }

    await applyToJob({
      candidateUserId: user.id,
      jobId: parsed.data.jobId,
      resumeId: parsed.data.resumeId,
      coverNote: parsed.data.coverNote ?? null,
    });

    revalidatePath("/dashboard/applications");
    return formSuccess(
      "Application submitted. Good luck - we have notified the employer.",
    );
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[applications] apply failed:", error);
    return formError("We could not submit your application. Please try again.");
  }
}

export async function toggleSavedJobAction(
  formData: FormData,
): Promise<{ saved: boolean }> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const jobId = z.uuid().parse(formData.get("jobId"));
  const saved = await toggleSavedJob(user.id, jobId);
  return { saved };
}

/** Form-action friendly variant used by the "Remove" button. */
export async function unsaveJobAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const jobId = z.uuid().parse(formData.get("jobId"));
  await toggleSavedJob(user.id, jobId);
  revalidatePath("/dashboard/saved");
}

export async function withdrawApplicationAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiUser();
  const applicationId = z.uuid().parse(formData.get("applicationId"));
  await withdrawApplication(applicationId, user.id);
  revalidatePath("/dashboard/applications");
}