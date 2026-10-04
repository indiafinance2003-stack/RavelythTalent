import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { companies } from "./company";
import {
  contentStatusEnum,
  emailStatusEnum,
  supportStatusEnum,
} from "./enums";

/* -------------------------------------------------------------------------- */
/* site_settings (single row, id = 1)                                         */
/* -------------------------------------------------------------------------- */

export const siteSettings = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),

  brandName: text("brand_name").notNull().default("Ravelyth Talent"),
  tagline: text("tagline"),
  subTagline: text("sub_tagline"),

  legalCompanyName: text("legal_company_name"),
  contactEmail: text("contact_email"),
  supportEmail: text("support_email"),
  contactPhone: text("contact_phone"),

  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("India"),

  gstin: text("gstin"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("INR"),

  socialLinkedin: text("social_linkedin"),
  socialTwitter: text("social_twitter"),
  socialFacebook: text("social_facebook"),
  socialInstagram: text("social_instagram"),
  socialYoutube: text("social_youtube"),

  privacyPolicyOverride: text("privacy_policy_override"),
  termsOverride: text("terms_override"),
  refundPolicyOverride: text("refund_policy_override"),

  featureBlog: boolean("feature_blog").notNull().default(true),
  featureReviews: boolean("feature_reviews").notNull().default(true),
  featureSalaryInsights: boolean("feature_salary_insights").notNull().default(true),
  featureResumeDatabase: boolean("feature_resume_database").notNull().default(true),

  resumeDbViewLimit: integer("resume_db_view_limit").notNull().default(50),
  jobPostWarningThreshold: integer("job_post_warning_threshold").notNull().default(80),

  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* notifications (in-app)                                                     */
/* -------------------------------------------------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_unread_idx").on(t.userId, t.isRead),
  ],
);

/* -------------------------------------------------------------------------- */
/* email_outbox (queue + delivery log)                                        */
/* -------------------------------------------------------------------------- */

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text"),
    templateKey: text("template_key"),
    status: emailStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    messageId: text("message_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_outbox_status_idx").on(t.status),
    index("email_outbox_next_attempt_idx").on(t.nextAttemptAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* audit_logs                                                                 */
/* -------------------------------------------------------------------------- */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* blog_posts                                                                 */
/* -------------------------------------------------------------------------- */

export const blogPosts = pgTable(
  "blog_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    coverImagePath: text("cover_image_path"),
    category: text("category"),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorName: text("author_name"),
    status: contentStatusEnum("status").notNull().default("draft"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    viewsCount: integer("views_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("blog_posts_status_idx").on(t.status),
    index("blog_posts_published_idx").on(t.publishedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* priority_support_requests (Enterprise flag)                                */
/* -------------------------------------------------------------------------- */

export const prioritySupportRequests = pgTable(
  "priority_support_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    isPriority: boolean("is_priority").notNull().default(false),
    status: supportStatusEnum("status").notNull().default("open"),
    response: text("response"),
    handledByUserId: uuid("handled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("priority_support_status_idx").on(t.status),
    index("priority_support_priority_idx").on(t.isPriority),
  ],
);

/* -------------------------------------------------------------------------- */
/* contact_messages                                                           */
/* -------------------------------------------------------------------------- */

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject"),
  message: text("message").notNull(),
  ip: text("ip"),
  handled: boolean("handled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
