"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, blogPosts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { deleteStoredFile, readValidatedUpload, storeValidatedFile } from "@/lib/storage";

const schema = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().min(3).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  excerpt: z.string().trim().max(500),
  content: z.string().trim().min(20).max(50_000),
  category: z.string().trim().max(100),
  authorName: z.string().trim().max(120),
  metaTitle: z.string().trim().max(180),
  metaDescription: z.string().trim().max(320),
  status: z.enum(["draft", "published"]),
  removeCover: z.boolean(),
});

const COVER_MIMES = ["image/jpeg", "image/png", "image/webp"];

export async function saveBlogPostAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = schema.safeParse({
    id: String(formData.get("id") ?? ""),
    title: formData.get("title"),
    slug: formData.get("slug"),
    excerpt: formData.get("excerpt") ?? "",
    content: formData.get("content"),
    category: formData.get("category") ?? "",
    authorName: formData.get("authorName") ?? "",
    metaTitle: formData.get("metaTitle") ?? "",
    metaDescription: formData.get("metaDescription") ?? "",
    status: formData.get("status"),
    removeCover: formData.get("removeCover") === "on",
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid blog post.", 422);
  }
  const value = parsed.data;

  const existing = value.id
    ? await db.select().from(blogPosts).where(eq(blogPosts.id, value.id)).limit(1)
    : [];
  if (value.id && !existing[0]) throw new AppError("Blog post not found.", 404, "not_found");
  const duplicate = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(
      value.id
        ? and(eq(blogPosts.slug, value.slug), ne(blogPosts.id, value.id))
        : eq(blogPosts.slug, value.slug),
    )
    .limit(1);
  if (duplicate[0]) throw new AppError("That blog slug is already in use.", 409, "slug_conflict");

  const file = formData.get("cover");
  let newCoverPath: string | null | undefined;
  if (value.removeCover) newCoverPath = null;
  if (file instanceof File && file.size > 0) {
    const { buffer, mimeType } = await readValidatedUpload(file, {
      allowedMimes: COVER_MIMES,
      maxBytes: 4 * 1024 * 1024,
    });
    newCoverPath = (
      await storeValidatedFile("blog", buffer, mimeType)
    ).storagePath;
  }
  const priorCoverPath = existing[0]?.coverImagePath ?? null;
  const priorSlug = existing[0]?.slug;
  const publishedAt =
    value.status === "published"
      ? existing[0]?.status === "published"
        ? existing[0].publishedAt ?? new Date()
        : new Date()
      : null;
  const postData = {
    title: value.title,
    slug: value.slug,
    excerpt: value.excerpt || null,
    content: value.content,
    coverImagePath: newCoverPath === undefined ? priorCoverPath : newCoverPath,
    category: value.category || null,
    authorUserId: admin.id,
    authorName: value.authorName || null,
    status: value.status,
    metaTitle: value.metaTitle || null,
    metaDescription: value.metaDescription || null,
    publishedAt,
    updatedAt: new Date(),
  };

  try {
    await db.transaction(async (tx) => {
      const [saved] = value.id
        ? await tx.update(blogPosts).set(postData).where(eq(blogPosts.id, value.id)).returning({ id: blogPosts.id })
        : await tx.insert(blogPosts).values(postData).returning({ id: blogPosts.id });
      if (!saved) throw new AppError("Blog post could not be saved.", 500, "blog_save_failed");
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorRole: "admin",
        action: value.id ? "blog_post.updated" : "blog_post.created",
        entityType: "blog_post",
        entityId: saved.id,
        description: `${value.title} blog post ${value.id ? "updated" : "created"}.`,
      });
    });
  } catch (error) {
    if (newCoverPath && newCoverPath !== priorCoverPath) await deleteStoredFile(newCoverPath);
    if (isUniqueViolation(error)) {
      throw new AppError("That blog slug is already in use.", 409, "slug_conflict");
    }
    throw error;
  }
  if (priorCoverPath && newCoverPath !== undefined && priorCoverPath !== newCoverPath) {
    await deleteStoredFile(priorCoverPath);
  }
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${value.slug}`);
  if (priorSlug && priorSlug !== value.slug) revalidatePath(`/blog/${priorSlug}`);
  revalidatePath("/sitemap.xml");
}

export async function deleteBlogPostAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const id = z.uuid().parse(formData.get("id"));
  const post = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(blogPosts)
      .where(eq(blogPosts.id, id))
      .returning({ id: blogPosts.id, title: blogPosts.title, slug: blogPosts.slug, coverImagePath: blogPosts.coverImagePath });
    if (!deleted) throw new AppError("Blog post not found.", 404, "not_found");
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: "blog_post.deleted",
      entityType: "blog_post",
      entityId: deleted.id,
      description: `${deleted.title} blog post deleted.`,
    });
    return deleted;
  });
  if (post.coverImagePath) await deleteStoredFile(post.coverImagePath);
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/sitemap.xml");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
