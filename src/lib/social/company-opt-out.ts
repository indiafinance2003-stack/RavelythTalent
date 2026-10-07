"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { requireCompanyMembership } from "@/lib/entitlements";
import { NotFoundError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";

/**
 * Employer toggle: "Do not promote my jobs on Ravelyth's social media."
 * Opted-out companies are never enqueued for social posts.
 */
export async function setSocialPromotionOptOutAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const companyId = String(formData.get("companyId") ?? "");
  if (!companyId) throw new NotFoundError("Company not found.");
  await requireCompanyMembership(user.id, companyId, "admin");

  const optedOut = formData.get("optOut") === "on";
  const [updated] = await db
    .update(companies)
    .set({ socialPromotionOptOut: optedOut, updatedAt: new Date() })
    .where(eq(companies.id, companyId))
    .returning({ id: companies.id });
  if (!updated) throw new NotFoundError("Company not found.");

  revalidatePath("/recruiter/company");
}
