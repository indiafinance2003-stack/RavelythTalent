import type { jobs } from "@/lib/db/schema";
import { notifyMatchingCandidatesOfPublishedJob } from "@/lib/alerts/service";
import { enqueueSocialPostsForJob } from "@/lib/social/queue";

export async function onJobPublished(job: typeof jobs.$inferSelect): Promise<void> {
  await notifyMatchingCandidatesOfPublishedJob(job.id);
  // Social enqueue failures must never break job publication; the admin can
  // also queue a post manually from /admin/social.
  try {
    await enqueueSocialPostsForJob(job);
  } catch (error) {
    console.error("social enqueue failed", { jobId: job.id, error });
  }
}
