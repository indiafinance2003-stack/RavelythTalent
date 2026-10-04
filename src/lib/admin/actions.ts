"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { decideCompanyReview, decideJobReview } from "./moderation";

const decisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(1000).optional(),
});

async function parseDecision(formData: FormData) {
  const parsed = decisionSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    reason: String(formData.get("reason") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid review decision.", 422);
  }
  if (parsed.data.decision === "rejected" && !parsed.data.reason) {
    throw new AppError("Provide a reason when rejecting a submission.", 422);
  }
  return parsed.data;
}

export async function decideCompanyAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const decision = await parseDecision(formData);
  await decideCompanyReview(
    admin.id,
    decision.id,
    decision.decision,
    decision.reason ?? null,
  );
  revalidatePath("/admin");
  revalidatePath("/admin/companies");
  revalidatePath("/recruiter/company");
}

export async function decideJobAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const decision = await parseDecision(formData);
  await decideJobReview(
    admin.id,
    decision.id,
    decision.decision,
    decision.reason ?? null,
  );
  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/recruiter/jobs");
  revalidatePath("/jobs");
}
