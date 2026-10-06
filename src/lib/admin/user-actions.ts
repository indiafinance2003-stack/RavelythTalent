"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { deleteAdminManagedUser } from "@/lib/admin/user-deletion";

const schema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "suspended", "deactivated"]),
});

const deleteSchema = z.object({
  userId: z.uuid(),
  confirmationEmail: z.string().trim().email().max(254),
});

async function changeUserStatusActionImpl(formData: FormData): Promise<void> {
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

export async function changeUserStatusAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/users", () => changeUserStatusActionImpl(formData));
}

async function deleteUserActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = deleteSchema.safeParse({
    userId: formData.get("userId"),
    confirmationEmail: formData.get("confirmationEmail"),
  });
  if (!parsed.success) {
    throw new AppError(
      parsed.error.issues[0]?.message ?? "Type a valid account email address.",
      422,
    );
  }

  const result = await deleteAdminManagedUser({
    actorUserId: admin.id,
    targetUserId: parsed.data.userId,
    confirmationEmail: parsed.data.confirmationEmail,
  });
  revalidatePath("/admin/users");
  redirect(result.failedFileCleanupCount > 0
    ? `/admin/users?fileCleanup=${result.failedFileCleanupCount}`
    : "/admin/users?deleted=1");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/users", () => deleteUserActionImpl(formData));
}
