import type { jobs } from "@/lib/db/schema";

export async function onJobPublished(_job: typeof jobs.$inferSelect): Promise<void> {
  // Intentionally empty; integrations may attach to this hook later.
}
