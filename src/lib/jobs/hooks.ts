import type { jobs } from "@/lib/db/schema";
import { notifyMatchingCandidatesOfPublishedJob } from "@/lib/alerts/service";

export async function onJobPublished(job: typeof jobs.$inferSelect): Promise<void> {
  await notifyMatchingCandidatesOfPublishedJob(job.id);
}
