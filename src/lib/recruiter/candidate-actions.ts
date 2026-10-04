"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { candidateProfiles, companies, savedCandidates } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { hasCompanyFeature, requireCompanyMembership } from "@/lib/entitlements";
import { assertSameOrigin } from "@/lib/security";

const schema = z.object({
  companyId: z.uuid(),
  candidateUserId: z.uuid(),
  action: z.enum(["save", "remove"]),
});

export async function saveCandidateAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  if (user.role !== "recruiter") throw new AppError("Recruiter access is required.", 403, "forbidden");
  const parsed = schema.safeParse({
    companyId: formData.get("companyId"),
    candidateUserId: formData.get("candidateUserId"),
    action: formData.get("action"),
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid candidate action.", 422);
  await requireCompanyMembership(user.id, parsed.data.companyId);
  if (!await hasCompanyFeature(parsed.data.companyId, "saved_candidates")) {
    throw new AppError("Saved candidates are not included in your current plan.", 403, "feature_not_in_plan");
  }

  if (parsed.data.action === "save") {
    const [company] = await db.select({ status: companies.status })
      .from(companies).where(eq(companies.id, parsed.data.companyId)).limit(1);
    const [candidate] = await db.select({ userId: candidateProfiles.userId })
      .from(candidateProfiles)
      .where(and(
        eq(candidateProfiles.userId, parsed.data.candidateUserId),
        eq(candidateProfiles.discoverable, true),
      ))
      .limit(1);
    if (company?.status !== "approved" || !candidate) {
      throw new AppError("This candidate is not available to save.", 404, "candidate_not_found");
    }
    await db.insert(savedCandidates).values({
      companyId: parsed.data.companyId,
      candidateUserId: parsed.data.candidateUserId,
      savedByUserId: user.id,
    }).onConflictDoNothing();
  } else {
    await db.delete(savedCandidates).where(and(
      eq(savedCandidates.companyId, parsed.data.companyId),
      eq(savedCandidates.candidateUserId, parsed.data.candidateUserId),
    ));
  }
  revalidatePath("/recruiter/candidates");
}
