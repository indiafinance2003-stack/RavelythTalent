"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { chatBlocks } from "@/lib/db/schema";

const schema = z.object({
  blockedUserId: z.uuid(),
});

export async function blockUser(formData: FormData) {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const parsed = schema.safeParse({
    blockedUserId: formData.get("blockedUserId"),
  });
  if (!parsed.success) {
    throw new AppError("Invalid input.", 422);
  }
  const { blockedUserId } = parsed.data;
  if (blockedUserId === user.id) return;

  await db
    .insert(chatBlocks)
    .values({ blockerUserId: user.id, blockedUserId })
    .onConflictDoNothing();

  revalidatePath(`/dashboard/messages`);
  revalidatePath(`/recruiter/messages`);
}