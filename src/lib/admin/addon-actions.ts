"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { addons, auditLogs } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";

const addonSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  type: z.enum(["per_job", "per_company", "subscription"]),
  pricePaise: z.preprocess(
    (value) => value === "" || value === null ? null : Number(value),
    z.number().int().positive().nullable(),
  ),
  durationDays: z.coerce.number().int().min(1).max(3650),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  isActive: z.boolean(),
});

export async function saveAddonAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = addonSchema.safeParse({
    id: String(formData.get("id") ?? "").trim() || undefined,
    code: formData.get("code"),
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    type: formData.get("type"),
    pricePaise: formData.get("pricePaise"),
    durationDays: formData.get("durationDays"),
    sortOrder: formData.get("sortOrder"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid add-on.", 422);
  }
  const value = parsed.data;
  if (value.isActive && value.pricePaise === null) {
    throw new AppError("An active add-on must have a price in paise.", 422);
  }
  if (value.id && !z.uuid().safeParse(value.id).success) {
    throw new AppError("Invalid add-on identifier.", 422);
  }

  const data = {
    code: value.code,
    name: value.name,
    description: value.description || null,
    type: value.type,
    pricePaise: value.pricePaise,
    durationDays: value.durationDays,
    sortOrder: value.sortOrder,
    isActive: value.isActive,
    updatedAt: new Date(),
  };
  if (value.id) {
    const updated = await db
      .update(addons)
      .set(data)
      .where(eq(addons.id, value.id))
      .returning({ id: addons.id });
    if (updated.length === 0) throw new AppError("Add-on not found.", 404, "not_found");
  } else {
    await db.insert(addons).values(data);
  }

  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: value.id ? "addon.updated" : "addon.created",
    entityType: "addon",
    entityId: value.id ?? value.code,
    description: `${value.name} add-on ${value.id ? "updated" : "created"}.`,
  });
  revalidatePath("/admin/add-ons");
  revalidatePath("/recruiter/add-ons");
}
