import { date, integer, pgTable, text, timestamp, uniqueIndex, uuid, boolean, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { jobs } from "./jobs";

export type SocialPlatform = "facebook" | "instagram";
export type SocialPostStatus =
  | "queued"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled"
  | "skipped";

/**
 * Singleton row (id = 1). Credentials are never stored here - they come from
 * SOCIAL_* environment variables only; missing credentials simply show
 * "Not configured" and never break the rest of the admin area.
 */
export const socialSettings = pgTable("social_settings", {
  id: integer("id").primaryKey().default(1),
  /** Master switch - DEFAULT OFF. */
  enabled: boolean("enabled").notNull().default(false),
  facebookEnabled: boolean("facebook_enabled").notNull().default(true),
  instagramEnabled: boolean("instagram_enabled").notNull().default(true),
  maxPostsPerDay: integer("max_posts_per_day").notNull().default(10),
  minMinutesBetweenPosts: integer("min_minutes_between_posts").notNull().default(20),
  /** Posting window in IST, "HH:MM" 24h. */
  windowStart: text("window_start").notNull().default("09:00"),
  windowEnd: text("window_end").notNull().default("21:00"),
  hashtags: text("hashtags").notNull().default(""),
  captionTemplate: text("caption_template")
    .notNull()
    .default("{{title}} at {{company}} in {{location}}. {{link}}"),
  /** "Pause all" kill switch. */
  pauseAll: boolean("pause_all").notNull().default(false),
  /** Set when the Graph API reports an expired/invalid token; cleared on success. */
  facebookTokenError: text("facebook_token_error"),
  instagramTokenError: text("instagram_token_error"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per job + platform (unique - enqueued from the publish hook with
 * onConflictDoNothing for dedupe). No candidate or employer private data is
 * ever stored here; the caption is built only from public job fields.
 */
export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    platform: text("platform").$type<SocialPlatform>().notNull(),
    status: text("status").$type<SocialPostStatus>().notNull().default("queued"),
    caption: text("caption").notNull().default(""),
    /** Platform-specific post identifier returned by the Graph API. */
    platformPostId: text("platform_post_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("social_posts_job_platform_key").on(t.jobId, t.platform),
    index("social_posts_status_next_idx").on(t.status, t.nextAttemptAt),
    index("social_posts_platform_published_idx").on(t.platform, t.publishedAt),
  ],
);

/** One row per calendar day (Asia/Kolkata) that the WhatsApp digest was marked posted. */
export const whatsappDigests = pgTable(
  "whatsapp_digests",
  {
    digestDate: date("digest_date", { mode: "string" }).primaryKey(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    postedByUserId: uuid("posted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
);
