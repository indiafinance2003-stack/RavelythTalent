"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, contactMessages } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { runAdminFormAction } from "@/lib/admin/form-errors";

async function markContactMessageHandledActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const id = z.uuid().parse(formData.get("id"));
  const handled = formData.get("handled") === "true";
  const [message] = await db
    .update(contactMessages)
    .set({ handled })
    .where(eq(contactMessages.id, id))
    .returning({ id: contactMessages.id, email: contactMessages.email });
  if (!message) throw new AppError("Contact message not found.", 404, "not_found");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: handled ? "contact_message.handled" : "contact_message.reopened",
    entityType: "contact_message",
    entityId: message.id,
    description: `Contact message from ${message.email} ${handled ? "marked handled" : "reopened"}.`,
  });
  revalidatePath("/admin/support");
}

export async function markContactMessageHandledAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/support", () => markContactMessageHandledActionImpl(formData));
}
