"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { requireCompanyMembership } from "@/lib/entitlements";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AppError } from "@/lib/errors";

const schema = z.object({
  companyId: z.uuid(),
  chatEnabled: z.boolean(),
  chatBeforeApplyEnabled: z.boolean(),
});

export async function updateCompanyChatSettings(formData: FormData) {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const parsed = schema.safeParse({
    companyId: formData.get("companyId"),
    chatEnabled: formData.get("chatEnabled") === "on",
    chatBeforeApplyEnabled: formData.get("chatBeforeApplyEnabled") === "on",
  });
  if (!parsed.success) {
    throw new AppError("Invalid input.", 422);
  }
  const { companyId, chatEnabled, chatBeforeApplyEnabled } = parsed.data;
  await requireCompanyMembership(user.id, companyId);

  await db
    .update(companies)
    .set({ chatEnabled, chatBeforeApplyEnabled, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  revalidatePath(`/recruiter/company`);
}