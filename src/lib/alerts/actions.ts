"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import { createAlert, deleteAlert, toggleAlert } from "./service";

const alertSchema = z.object({
  name: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  frequency: z.enum(["daily", "weekly"]).default("daily"),
});

export async function createAlertAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();

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
  await deleteAlert(user.id, z.uuid().parse(formData.get("alertId")));
  revalidatePath("/dashboard/alerts");
}

export async function toggleAlertAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  await toggleAlert(
    user.id,
    z.uuid().parse(formData.get("alertId")),
    formData.get("isActive") === "true",
  );
  revalidatePath("/dashboard/alerts");
}
