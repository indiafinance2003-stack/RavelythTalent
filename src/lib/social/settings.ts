import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialSettings } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import type { SocialPlatform } from "@/lib/db/schema";

export type SocialSettingsRow = typeof socialSettings.$inferSelect;

/** Credential status per platform; secrets are never exposed to the UI. */
export type SocialConnectionStatus = {
  platform: SocialPlatform;
  configured: boolean;
  tokenError: string | null;
};

/** Ensure the singleton row exists and return it (defaults: master switch OFF). */
export async function getSocialSettings(): Promise<SocialSettingsRow> {
  await db.insert(socialSettings).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(socialSettings)
    .where(eq(socialSettings.id, 1))
    .limit(1);
  if (!row) throw new Error("social_settings row missing after insert.");
  return row;
}

export function getSocialConnectionStatuses(
  settings?: Pick<SocialSettingsRow, "facebookTokenError" | "instagramTokenError"> | null,
): SocialConnectionStatus[] {
  const env = getEnv();
  return [
    {
      platform: "facebook",
      configured: Boolean(env.SOCIAL_FACEBOOK_PAGE_ID && env.SOCIAL_FACEBOOK_PAGE_TOKEN),
      tokenError: settings?.facebookTokenError ?? null,
    },
    {
      platform: "instagram",
      configured: Boolean(env.SOCIAL_INSTAGRAM_USER_ID && env.SOCIAL_FACEBOOK_PAGE_TOKEN),
      tokenError: settings?.instagramTokenError ?? null,
    },
  ];
}
