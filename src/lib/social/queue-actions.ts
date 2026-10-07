"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { db } from "@/lib/db";
import { auditLogs, socialPosts } from "@/lib/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { postJobNow } from "./post-now";

async function actor() {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("socialQueue", admin.id), { limit: 30, windowSeconds: 60 });
  return admin;
}

function parsePostId(formData: FormData): string {
  const parsed = z.uuid().safeParse(formData.get("id"));
  if (!parsed.success) throw new AppError("Invalid post id.", 422);
  return parsed.data;
}

async function audit(adminId: string, action: string, postId: string, description: string) {
  await db.insert(auditLogs).values({
    actorUserId: adminId,
    actorRole: "admin",
    action,
    entityType: "social_posts",
    entityId: postId,
    description,
  });
}

/** Reset a failed/cancelled post back to the queue for the next cron run. */
async function retryPostImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const id = parsePostId(formData);
  const [post] = await db
    .select({ id: socialPosts.id, status: socialPosts.status })
    .from(socialPosts)
    .where(eq(socialPosts.id, id))
    .limit(1);
  if (!post) throw new NotFoundError("Social post not found.");
  if (post.status === "published") {
    throw new AppError("This post was already published.", 409, "already_published");
  }
  await db
    .update(socialPosts)
    .set({
      status: "queued",
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, id));
  await audit(admin.id, "social.post_retried", id, "Social post requeued.");
  revalidatePath("/admin/social");
}

export async function retrySocialPostAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/social", () => retryPostImpl(formData));
}

/** Cancel a queued post so it is never sent. */
async function cancelPostImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const id = parsePostId(formData);
  const [post] = await db
    .select({ id: socialPosts.id, status: socialPosts.status })
    .from(socialPosts)
    .where(eq(socialPosts.id, id))
    .limit(1);
  if (!post) throw new NotFoundError("Social post not found.");
  if (post.status === "published") {
    throw new AppError("A published post cannot be cancelled.", 409, "already_published");
  }
  await db
    .update(socialPosts)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(socialPosts.id, id));
  await audit(admin.id, "social.post_cancelled", id, "Social post cancelled.");
  revalidatePath("/admin/social");
}

export async function cancelSocialPostAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/social", () => cancelPostImpl(formData));
}

/** Per-job "post now": publish immediately, bypassing cap/spacing/window. */
async function postNowImpl(formData: FormData): Promise<void> {
  const admin = await actor();
  const jobId = z.uuid().safeParse(formData.get("jobId"));
  const platform = z.enum(["facebook", "instagram"]).safeParse(formData.get("platform"));
  if (!jobId.success || !platform.success) {
    throw new AppError("A valid job and platform are required.", 422);
  }
  const result = await postJobNow(jobId.data, platform.data);
  if (!result.ok) throw new AppError(result.reason, 409, "post_now_rejected");
  await audit(
    admin.id,
    "social.posted_now",
    jobId.data,
    `Job posted manually to ${platform.data}.`,
  );
  revalidatePath("/admin/social");
}

export async function postJobNowAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/social", () => postNowImpl(formData));
}
