"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";

const schema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "suspended", "deactivated"]),
});

export async function changeUserStatusAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = schema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid user status.", 422);
  }
  if (parsed.data.userId === admin.id) {
    throw new AppError("You cannot change your own account status.", 403, "self_status_change");
  }
  const [updated] = await db
    .update(users)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(users.id, parsed.data.userId), ne(users.role, "admin")))
    .returning({ id: users.id, fullName: users.fullName });
  if (!updated) {
    throw new AppError("User not found or is an administrator.", 404, "not_found");
  }
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: `user.${parsed.data.status}`,
    entityType: "user",
    entityId: updated.id,
    description: `${updated.fullName}'s account was set to ${parsed.data.status}.`,
  });
  revalidatePath("/admin/users");
}
