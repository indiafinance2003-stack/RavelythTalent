import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export type InboxAccountId = "support" | "gmail";
export type LeadStatus =
  | "new"
  | "emailed"
  | "replied"
  | "interested"
  | "subscribed"
  | "rejected"
  | "bounced"
  | "do_not_contact";

export const inboxAccounts = pgTable("inbox_accounts", {
  id: text("id").$type<InboxAccountId>().primaryKey(),
  uidValidity: text("uid_validity"),
  lastUid: bigint("last_uid", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inboxThreads = pgTable(
  "inbox_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .$type<InboxAccountId>()
      .notNull()
      .references(() => inboxAccounts.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default("(no subject)"),
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    status: text("status").$type<"open" | "handled">().notNull().default("open"),
    category: text("category"),
    needsAttention: boolean("needs_attention").notNull().default(false),
    leadId: uuid("lead_id").references(() => companyLeads.id, {
      onDelete: "set null",
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inbox_threads_account_idx").on(t.accountId),
    index("inbox_threads_status_idx").on(t.status),
    index("inbox_threads_attention_idx").on(t.needsAttention),
    index("inbox_threads_category_idx").on(t.category),
    index("inbox_threads_last_message_idx").on(t.lastMessageAt),
    index("inbox_threads_lead_idx").on(t.leadId),
  ],
);

export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .$type<InboxAccountId>()
      .notNull()
      .references(() => inboxAccounts.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => inboxThreads.id, { onDelete: "cascade" }),
    remoteUid: bigint("remote_uid", { mode: "number" }),
    remoteUidValidity: text("remote_uid_validity"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    fromAddress: text("from_address").notNull(),
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull().default("(no subject)"),
    textBody: text("text_body").notNull().default(""),
    attachmentNames: jsonb("attachment_names").$type<string[]>().notNull().default([]),
    direction: text("direction").$type<"inbound" | "outbound">().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inbox_messages_account_message_id_key").on(t.accountId, t.messageId),
    uniqueIndex("inbox_messages_account_uid_key").on(
      t.accountId,
      t.remoteUidValidity,
      t.remoteUid,
    ),
    index("inbox_messages_thread_idx").on(t.threadId, t.createdAt),
    index("inbox_messages_in_reply_to_idx").on(t.inReplyTo),
  ],
);

export const inboxDrafts = pgTable(
  "inbox_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => inboxThreads.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .$type<InboxAccountId>()
      .notNull()
      .references(() => inboxAccounts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    source: text("source").$type<"manual" | "ai" | "opt_out_confirmation">().notNull().default("manual"),
    sendStatus: text("send_status").$type<"draft" | "sending" | "sent">().notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inbox_drafts_thread_idx").on(t.threadId)],
);

export const inboxClassifications = pgTable(
  "inbox_classifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => inboxThreads.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    urgency: text("urgency"),
    summary: text("summary"),
    suggestedStatus: text("suggested_status"),
    needsHuman: boolean("needs_human").notNull().default(false),
    confidence: integer("confidence"),
    source: text("source").$type<"rules" | "ai">().notNull().default("rules"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inbox_classifications_thread_idx").on(t.threadId)],
);

export const assistantFaq = pgTable(
  "assistant_faq",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assistant_faq_active_idx").on(t.isActive)],
);

export const companyLeads = pgTable(
  "company_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company: text("company").notNull(),
    contactName: text("contact_name"),
    designation: text("designation"),
    email: text("email").notNull(),
    phone: text("phone"),
    website: text("website"),
    city: text("city"),
    state: text("state"),
    industry: text("industry"),
    source: text("source"),
    status: text("status").$type<LeadStatus>().notNull().default("new"),
    notes: text("notes"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_leads_email_key").on(sql`lower(${t.email})`),
    index("company_leads_status_idx").on(t.status),
    index("company_leads_company_idx").on(t.company),
    index("company_leads_followup_idx").on(t.nextFollowupAt),
  ],
);

export const leadEvents = pgTable(
  "lead_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => companyLeads.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_events_lead_idx").on(t.leadId, t.createdAt)],
);

export const suppressedEmails = pgTable(
  "suppressed_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    leadId: uuid("lead_id").references(() => companyLeads.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("suppressed_emails_email_key").on(sql`lower(${t.email})`),
    index("suppressed_emails_created_idx").on(t.createdAt),
  ],
);

export const assistantSettings = pgTable("assistant_settings", {
  id: integer("id").primaryKey().default(1),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  model: text("model").notNull().default("claude-haiku-4-5"),
  monthlySpendCapUsd: integer("monthly_spend_cap_usd").notNull().default(0),
  autoSendSafeReplies: boolean("auto_send_safe_replies").notNull().default(false),
  signatureText: text("signature_text"),
  businessDescription: text("business_description"),
  optOutText: text("opt_out_text").notNull().default("Reply to this email with unsubscribe to opt out."),
  dailySendCap: integer("daily_send_cap").notNull().default(15),
  sendWindowStart: text("send_window_start").notNull().default("10:00"),
  sendWindowEnd: text("send_window_end").notNull().default("17:00"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadEmailDrafts = pgTable(
  "lead_email_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => companyLeads.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .$type<InboxAccountId>()
      .notNull()
      .references(() => inboxAccounts.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    source: text("source").$type<"ai" | "manual">().notNull().default("ai"),
    status: text("status")
      .$type<"draft" | "pending_approval" | "sent" | "cancelled">()
      .notNull()
      .default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_email_drafts_lead_idx").on(t.leadId, t.createdAt),
    index("lead_email_drafts_status_idx").on(t.status),
  ],
);

export const outreachCampaigns = pgTable(
  "outreach_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    senderAccountId: text("sender_account_id")
      .$type<InboxAccountId>()
      .notNull()
      .references(() => inboxAccounts.id, { onDelete: "restrict" }),
    status: text("status").$type<"draft" | "active" | "paused">().notNull().default("draft"),
    subjectTemplate: text("subject_template").notNull(),
    bodyTemplate: text("body_template").notNull(),
    followupSequence: jsonb("followup_sequence")
      .$type<Array<{ delayDays: number; subject: string; body: string; enabled: boolean }>>()
      .notNull()
      .default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_campaigns_status_idx").on(t.status)],
);

export const campaignMessages = pgTable(
  "campaign_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => outreachCampaigns.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => companyLeads.id, { onDelete: "cascade" }),
    step: integer("step").notNull().default(1),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status")
      .$type<"pending_approval" | "approved" | "queued" | "sending" | "sent" | "replied" | "bounced" | "opted_out" | "skipped" | "failed">()
      .notNull()
      .default("pending_approval"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    messageId: text("message_id"),
    source: text("source").$type<"manual" | "ai">().notNull().default("manual"),
    leadEmailDraftId: uuid("lead_email_draft_id").references(() => leadEmailDrafts.id, {
      onDelete: "set null",
    }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_messages_campaign_lead_step_key").on(t.campaignId, t.leadId, t.step),
    index("campaign_messages_status_scheduled_idx").on(t.status, t.scheduledAt),
    index("campaign_messages_lead_idx").on(t.leadId),
  ],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsdMicros: integer("estimated_cost_usd_micros").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);
