import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./company";
import { jobs } from "./jobs";
import { users } from "./auth";

export const chatSenderSideEnum = pgEnum("chat_sender_side", [
  "candidate",
  "employer",
]);

export const chatConversationStatusEnum = pgEnum("chat_conversation_status", [
  "open",
  "closed",
]);

export const chatReportReasonEnum = pgEnum("chat_report_reason", [
  "spam",
  "scam",
  "abuse",
  "harassment",
  "other",
]);

export const chatReportStatusEnum = pgEnum("chat_report_status", [
  "open",
  "reviewed",
  "resolved",
]);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id"),
    preApply: boolean("pre_apply").notNull().default(false),
    status: chatConversationStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_conversations_job_candidate_preapply_idx").on(
      t.jobId,
      t.candidateUserId,
      t.preApply,
    ),
    index("chat_conversations_company_idx").on(t.companyId),
    index("chat_conversations_candidate_idx").on(t.candidateUserId),
    index("chat_conversations_status_idx").on(t.status),
    index("chat_conversations_last_message_idx").on(t.lastMessageAt),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderSide: chatSenderSideEnum("sender_side").notNull(),
    body: text("body").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("chat_messages_conversation_idx").on(t.conversationId),
    index("chat_messages_sender_idx").on(t.senderUserId),
    index("chat_messages_created_idx").on(t.createdAt),
  ],
);

export const chatReports = pgTable(
  "chat_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(() => chatConversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: chatReportReasonEnum("reason").notNull(),
    details: text("details"),
    status: chatReportStatusEnum("status").notNull().default("open"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_reports_status_idx").on(t.status),
    index("chat_reports_conversation_idx").on(t.conversationId),
    index("chat_reports_message_idx").on(t.messageId),
    index("chat_reports_reporter_idx").on(t.reporterUserId),
  ],
);

export const chatBlocks = pgTable(
  "chat_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerUserId: uuid("blocker_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_blocks_blocker_blocked_idx").on(t.blockerUserId, t.blockedUserId),
    index("chat_blocks_blocked_idx").on(t.blockedUserId),
  ],
);
