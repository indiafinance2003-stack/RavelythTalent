"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, categories } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { runAdminFormAction } from "@/lib/admin/form-errors";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(140).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(500).optional(),
  parentId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  isActive: z.boolean(),
});

async function saveCategoryActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = schema.safeParse({
    id: String(formData.get("id") ?? "").trim() || undefined,
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: String(formData.get("description") ?? "").trim() || undefined,
    parentId: String(formData.get("parentId") ?? "").trim() || undefined,
    sortOrder: formData.get("sortOrder"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid category.", 422);
  const value = parsed.data;
  if (value.id && !z.uuid().safeParse(value.id).success) throw new AppError("Invalid category identifier.", 422);
  if (value.parentId && !z.uuid().safeParse(value.parentId).success) throw new AppError("Invalid parent category.", 422);
  if (value.id && value.id === value.parentId) throw new AppError("A category cannot be its own parent.", 422);

  const categoryData = {
    name: value.name,
    slug: value.slug,
    description: value.description || null,
    parentId: value.parentId || null,
    sortOrder: value.sortOrder,
    isActive: value.isActive,
    updatedAt: new Date(),
  };
  const [saved] = value.id
    ? await db.update(categories)
        .set(categoryData)
        .where(eq(categories.id, value.id))
        .returning({ id: categories.id })
    : await db.insert(categories)
        .values(categoryData)
        .returning({ id: categories.id });
  if (!saved) throw new AppError("Category not found.", 404, "not_found");

  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: value.id ? "category.updated" : "category.created",
    entityType: "category",
    entityId: saved.id,
    description: `${value.name} category ${value.id ? "updated" : "created"}.`,
  });
  revalidatePath("/admin/categories");
  revalidatePath("/jobs");
  revalidatePath("/recruiter/jobs/new");
}

export async function saveCategoryAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/categories", () => saveCategoryActionImpl(formData));
}
