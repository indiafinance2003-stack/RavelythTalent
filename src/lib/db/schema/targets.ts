import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export type CompanyTargetStatus =
  | "new"
  | "crawling"
  | "crawled"
  | "emails_found"
  | "contact_form_only"
  | "no_contact_found"
  | "approved"
  | "rejected"
  | "converted";

export type TargetEmailKind = "hr" | "generic" | "other";
export type ContactFormQueueStatus = "pending" | "done" | "skipped";

/**
 * A company website the assistant should crawl for public contact emails and
 * contact forms. Domains are stored lowercase and unique; the crawler never
 * submits forms - it only records their URL for manual outreach.
 */
export const companyTargets = pgTable(
  "company_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyName: text("company_name").notNull(),
    websiteUrl: text("website_url").notNull(),
    domain: text("domain").notNull().default(""),
    city: text("city"),
    state: text("state"),
    industry: text("industry"),
    source: text("source").notNull().default("manual"),
    status: text("status").$type<CompanyTargetStatus>().notNull().default("new"),
    contactFormUrl: text("contact_form_url"),
    crawlError: text("crawl_error"),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    createdById: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_targets_domain_key").on(t.domain),
    index("company_targets_status_idx").on(t.status),
    index("company_targets_last_crawled_idx").on(t.lastCrawledAt),
  ],
);

/** Email addresses discovered on a target's own website. */
export const targetEmails = pgTable(
  "target_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetId: uuid("target_id")
      .notNull()
      .references(() => companyTargets.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    kind: text("kind").$type<TargetEmailKind>().notNull().default("other"),
    sourceUrl: text("source_url"),
    mxOk: boolean("mx_ok").notNull().default(false),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("target_emails_target_email_key").on(t.targetId, t.email),
    index("target_emails_target_idx").on(t.targetId),
  ],
);

/** Manual queue of contact forms for an admin to open and submit by hand. */
export const contactFormQueue = pgTable(
  "contact_form_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetId: uuid("target_id")
      .notNull()
      .references(() => companyTargets.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    formUrl: text("form_url").notNull(),
    preparedMessage: text("prepared_message").notNull().default(""),
    status: text("status").$type<ContactFormQueueStatus>().notNull().default("pending"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contact_form_queue_status_idx").on(t.status),
    index("contact_form_queue_target_idx").on(t.targetId),
  ],
);
