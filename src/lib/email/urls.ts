import { getEnv } from "@/lib/env";

/** Absolute URL helper for emails - links must work outside the browser origin. */
export function appUrl(path = "/"): string {
  const base = getEnv().APP_URL.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export const EMAIL_MINUTE = 60;
export const EMAIL_HOUR = 60 * 60;
export const EMAIL_DAY = 24 * 60 * 60;