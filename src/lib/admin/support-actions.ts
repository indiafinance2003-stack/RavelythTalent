"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, prioritySupportRequests } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";

const schema = z.object({
  id: z.uuid(),
  status: z.enum(["open", "in_progress", "closed"]),
  response: z.string().trim().max(5000).optional(),
});

export async function updateSupportRequestAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    response: String(formData.get("response") ?? "").trim() || undefined,
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid support update.", 422);
  const [request] = await db.update(prioritySupportRequests)
    .set({
      status: parsed.data.status,
      response: parsed.data.response ?? null,
      handledByUserId: admin.id,
      updatedAt: new Date(),
    })
    .where(eq(prioritySupportRequests.id, parsed.data.id))
    .returning({ id: prioritySupportRequests.id, subject: prioritySupportRequests.subject });
  if (!request) throw new AppError("Support request not found.", 404, "not_found");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: `support.${parsed.data.status}`,
    entityType: "priority_support_request",
    entityId: request.id,
    description: `Support request "${request.subject}" moved to ${parsed.data.status}.`,
  });
  revalidatePath("/admin/support");
}
