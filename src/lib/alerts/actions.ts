"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError, AuthorizationError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import {
  createAlert,
  deleteAlert,
  toggleAlert,
  updateAlert,
  updateAlertPreferences,
} from "./service";

const alertSchema = z.object({
  name: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  frequency: z.enum(["daily", "weekly"]).default("daily"),
});

function assertCandidateRole(user: Awaited<ReturnType<typeof requireApiVerifiedUser>>): void {
  if (user.role !== "job_seeker") {
    throw new AuthorizationError("Only candidate accounts can manage job alerts.");
  }
}

export async function createAlertAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    assertCandidateRole(user);

    const parsed = alertSchema.safeParse({
      name: formData.get("name") ?? undefined,
      q: formData.get("q") ?? undefined,
      location: formData.get("location") ?? undefined,
      category: formData.get("category") ?? undefined,
      frequency: formData.get("frequency") ?? "daily",
    });
    if (!parsed.success) return formError("Please check the alert details.");

    await createAlert({
      userId: user.id,
      name: parsed.data.name ?? "Job alert",
      criteria: {
        q: parsed.data.q,
        location: parsed.data.location,
        category: parsed.data.category,
      },
      frequency: parsed.data.frequency,
    });

    revalidatePath("/dashboard/alerts");
    return formSuccess("Job alert created.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[alerts] create failed:", error);
    return formError("We could not create that alert.");
  }
}

export async function deleteAlertAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  assertCandidateRole(user);
  await deleteAlert(user.id, z.uuid().parse(formData.get("alertId")));
  revalidatePath("/dashboard/alerts");
}

export async function toggleAlertAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  assertCandidateRole(user);
  await toggleAlert(
    user.id,
    z.uuid().parse(formData.get("alertId")),
    formData.get("isActive") === "true",
  );
  revalidatePath("/dashboard/alerts");
}

export async function saveAlertPreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    assertCandidateRole(user);
    const frequency = z.enum(["daily", "weekly"]).safeParse(formData.get("frequency") ?? "daily");
    if (!frequency.success) return formError("Choose a daily or weekly frequency.");
    await updateAlertPreferences({
      userId: user.id,
      consent: formData.get("consent") === "on",
      frequency: frequency.data,
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/alerts");
    return formSuccess(formData.get("consent") === "on"
      ? "Job-alert email consent saved."
      : "Job-alert emails have been turned off.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[alerts] preferences save failed:", error);
    return formError("We could not save your job-alert preferences.");
  }
}

export async function updateAlertAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    assertCandidateRole(user);
    const parsed = alertSchema.extend({
      alertId: z.uuid(),
      name: z.string().trim().max(120),
    }).safeParse({
      alertId: formData.get("alertId"),
      name: formData.get("name") ?? "",
      q: formData.get("q") ?? "",
      location: formData.get("location") ?? "",
      category: formData.get("category") ?? "",
      frequency: formData.get("frequency") ?? "daily",
    });
    if (!parsed.success) return formError("Please check the alert details.");
    await updateAlert(user.id, parsed.data.alertId, {
      name: parsed.data.name,
      criteria: {
        q: parsed.data.q || undefined,
        location: parsed.data.location || undefined,
        category: parsed.data.category || undefined,
      },
      frequency: parsed.data.frequency,
    });
    revalidatePath("/dashboard/alerts");
    return formSuccess("Job alert updated.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[alerts] update failed:", error);
    return formError("We could not update that alert.");
  }
}
