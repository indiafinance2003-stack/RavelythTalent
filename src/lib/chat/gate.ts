import { AppError } from "@/lib/errors";
import { getSiteSettings } from "@/lib/settings";

/** Reads the global site_settings.chat_enabled switch (default false). */
export async function isGlobalChatEnabled(): Promise<boolean> {
  const settings = await getSiteSettings();
  return settings.chatEnabled === true;
}

/** Refuses every chat action while the global switch is off. */
export async function assertGlobalChatEnabled(): Promise<void> {
  if (!(await isGlobalChatEnabled())) {
    throw new AppError(
      "Chat is temporarily unavailable.",
      403,
      "chat_disabled",
    );
  }
}
