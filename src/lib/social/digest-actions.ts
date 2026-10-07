"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { db } from "@/lib/db";
import { auditLogs, whatsappDigests } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";

async function markPostedImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("socialDigest", admin.id), { limit: 20, windowSeconds: 60 });

  const digestDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(formData.get("digestDate"));
  if (!digestDate.success) throw new AppError("A valid digest date is required.", 422);

  await db
    .insert(whatsappDigests)
    .values({ digestDate: digestDate.data, postedByUserId: admin.id })
    .onConflictDoNothing({ target: whatsappDigests.digestDate });
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "social.digest_marked_posted",
    entityType: "whatsapp_digests",
    entityId: digestDate.data,
    description: `WhatsApp digest for ${digestDate.data} marked as posted.`,
  });
  revalidatePath("/admin/social/digest");
}

/** Record that the admin posted the digest for a date (manual, no automation). */
export async function markDigestPostedAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/social/digest", () => markPostedImpl(formData));
}
