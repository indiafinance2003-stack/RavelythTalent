import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Parsing is intentionally LAZY (`getEnv()` is called on first access) so that
 * importing a module never throws during `next build`. `instrumentation.ts`
 * calls `assertEnv()` once when the server actually starts.
 */

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalTrimmed = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgresql:// connection string",
    }),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),

  ADMIN_NAME: z.string().default("Liky"),
  ADMIN_EMAIL: optionalTrimmed,
  ADMIN_PASSWORD: optionalTrimmed,

  UPLOAD_DIR: z.string().default("./uploads"),

  SMTP_HOST: z.string().default("mail.ravelyth.in"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: boolFromString,
  SMTP_USER: optionalTrimmed,
  SMTP_PASS: optionalTrimmed,
  EMAIL_FROM: z.string().default("Ravelyth Talent <noreply@ravelyth.in>"),
  SUPPORT_EMAIL: optionalTrimmed,

  INBOX_SUPPORT_USER: optionalTrimmed,
  INBOX_SUPPORT_PASS: optionalTrimmed,
  INBOX_SUPPORT_ADDRESS: optionalTrimmed,
  INBOX_GMAIL_USER: optionalTrimmed,
  INBOX_GMAIL_APP_PASSWORD: optionalTrimmed,
  ANTHROPIC_API_KEY: optionalTrimmed,

  SOCIAL_FACEBOOK_PAGE_ID: optionalTrimmed,
  SOCIAL_FACEBOOK_PAGE_TOKEN: optionalTrimmed,
  SOCIAL_INSTAGRAM_USER_ID: optionalTrimmed,
  SOCIAL_GRAPH_VERSION: optionalTrimmed,

  RAZORPAY_KEY_ID: optionalTrimmed,
  RAZORPAY_KEY_SECRET: optionalTrimmed,
  RAZORPAY_WEBHOOK_SECRET: optionalTrimmed,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: optionalTrimmed,

  GOOGLE_CLIENT_ID: optionalTrimmed,
  GOOGLE_CLIENT_SECRET: optionalTrimmed,

  SMS_PROVIDER: z.enum(["console", "msg91", "twilio"]).default("console"),
  MSG91_AUTH_KEY: optionalTrimmed,
  MSG91_SENDER_ID: optionalTrimmed,
  MSG91_TEMPLATE_ID: optionalTrimmed,
  TWILIO_ACCOUNT_SID: optionalTrimmed,
  TWILIO_AUTH_TOKEN: optionalTrimmed,
  TWILIO_FROM_NUMBER: optionalTrimmed,
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;
let cachedError: string | null = null;

function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    cachedError = `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the values.`;
    throw new Error(cachedError);
  }
  cached = parsed.data;
  return cached;
}

/** Called from instrumentation.ts at server start. */
export function assertEnv(): void {
  try {
    getEnv();
  } catch (error) {
    if (isBuildPhase()) {
      console.warn("[env] Skipping strict validation during build phase.");
      return;
    }
    throw error;
  }
}

export function envError(): string | null {
  try {
    getEnv();
    return null;
  } catch (e) {
    return cachedError ?? (e instanceof Error ? e.message : String(e));
  }
}
