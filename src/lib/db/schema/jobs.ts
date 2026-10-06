import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { companies } from "./company";
import { resumes, skills } from "./candidate";
import {
  alertFrequencyEnum,
  applicationStatusEnum,
  interviewModeEnum,
  interviewStatusEnum,
  jobStatusEnum,
  jobTypeEnum,
  salaryPeriodEnum,
  workModeEnum,
} from "./enums";
import { type AnyPgColumn } from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* categories                                                                 */
/* -------------------------------------------------------------------------- */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    icon: text("icon"),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_slug_key").on(t.slug),
    index("categories_parent_idx").on(t.parentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* jobs                                                                       */
/* -------------------------------------------------------------------------- */

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    postedByUserId: uuid("posted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    responsibilities: text("responsibilities"),
    requirements: text("requirements"),
    jobType: jobTypeEnum("job_type").notNull().default("full_time"),
    workMode: workModeEnum("work_mode").notNull().default("onsite"),
    city: text("city"),
    state: text("state"),
    country: text("country").default("India"),
    locations: jsonb("locations").$type<string[]>().default([]),
    salaryMinPaise: bigint("salary_min_paise", { mode: "number" }),
    salaryMaxPaise: bigint("salary_max_paise", { mode: "number" }),
    salaryCurrency: text("salary_currency").notNull().default("INR"),
    salaryPeriod: salaryPeriodEnum("salary_period").notNull().default("year"),
    salaryHidden: boolean("salary_hidden").notNull().default(false),
    experienceMinYears: numeric("experience_min_years", { precision: 4, scale: 1 }),
    experienceMaxYears: numeric("experience_max_years", { precision: 4, scale: 1 }),
    educationRequirement: text("education_requirement"),
    openings: integer("openings").notNull().default(1),
    deadline: timestamp("deadline", { withTimezone: true }),
    status: jobStatusEnum("status").notNull().default("draft"),
    isFeatured: boolean("is_featured").notNull().default(false),
    isUrgent: boolean("is_urgent").notNull().default(false),
    moderationNotes: text("moderation_notes"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Billing/quota bucket, e.g. "2026-01". */
    quotaPeriodKey: text("quota_period_key"),
    viewsCount: integer("views_count").notNull().default(0),
    applicationsCount: integer("applications_count").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("jobs_slug_key").on(t.slug),
    index("jobs_company_idx").on(t.companyId),
    index("jobs_status_idx").on(t.status),
    index("jobs_category_idx").on(t.categoryId),
    index("jobs_published_at_idx").on(t.publishedAt),
    index("jobs_city_idx").on(t.city),
    index("jobs_quota_period_idx").on(t.quotaPeriodKey),
  ],
);

/* -------------------------------------------------------------------------- */
/* job_reports                                                                */
/* -------------------------------------------------------------------------- */

export const jobReports = pgTable(
  "job_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Stable per-job reporter identifier; anonymous IPs are stored as hashes. */
    reporterKey: text("reporter_key").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    status: text("status").notNull().default("open"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("job_reports_job_reporter_key").on(t.jobId, t.reporterKey),
    index("job_reports_status_idx").on(t.status),
    index("job_reports_job_idx").on(t.jobId),
    index("job_reports_created_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* job_skills                                                                 */
/* -------------------------------------------------------------------------- */

export const jobSkills = pgTable(
  "job_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    isMandatory: boolean("is_mandatory").notNull().default(false),
  },
  (t) => [
    uniqueIndex("job_skills_key").on(t.jobId, t.skillId),
    index("job_skills_skill_idx").on(t.skillId),
  ],
);

/* -------------------------------------------------------------------------- */
/* applications                                                               */
/* -------------------------------------------------------------------------- */

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resumeId: uuid("resume_id").references(() => resumes.id, {
      onDelete: "set null",
    }),
    coverNote: text("cover_note"),
    status: applicationStatusEnum("status").notNull().default("applied"),
    source: text("source").default("direct"),
    recruiterNotes: text("recruiter_notes"),
    /** Bumped whenever the recruiter changes status - used for audit. */
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("applications_job_candidate_key").on(t.jobId, t.candidateUserId),
    index("applications_job_idx").on(t.jobId),
    index("applications_candidate_idx").on(t.candidateUserId),
    index("applications_status_idx").on(t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* application_status_history                                                 */
/* -------------------------------------------------------------------------- */

export const applicationStatusHistory = pgTable(
  "application_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status").notNull(),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_status_history_application_idx").on(t.applicationId)],
);

/* -------------------------------------------------------------------------- */
/* saved_jobs                                                                 */
/* -------------------------------------------------------------------------- */

export const savedJobs = pgTable(
  "saved_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_jobs_key").on(t.userId, t.jobId),
    index("saved_jobs_user_idx").on(t.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* job_alerts                                                                 */
/* -------------------------------------------------------------------------- */

export const jobAlerts = pgTable(
  "job_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
    frequency: alertFrequencyEnum("frequency").notNull().default("daily"),
    isActive: boolean("is_active").notNull().default(true),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("job_alerts_unsubscribe_token_key").on(t.unsubscribeToken),
    index("job_alerts_user_idx").on(t.userId),
    index("job_alerts_active_idx").on(t.isActive),
  ],
);

/* -------------------------------------------------------------------------- */
/* interviews                                                                 */
/* -------------------------------------------------------------------------- */

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    scheduledByUserId: uuid("scheduled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    mode: interviewModeEnum("mode").notNull().default("video"),
    location: text("location"),
    meetingLink: text("meeting_link"),
    notes: text("notes"),
    candidateNotes: text("candidate_notes"),
    status: interviewStatusEnum("status").notNull().default("scheduled"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("interviews_application_idx").on(t.applicationId),
    index("interviews_candidate_idx").on(t.candidateUserId),
    index("interviews_company_idx").on(t.companyId),
  ],
);

/* -------------------------------------------------------------------------- */
/* job_views (reports: views / source / conversion)                           */
/* -------------------------------------------------------------------------- */

export const jobViews = pgTable(
  "job_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    viewerUserId: uuid("viewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    viewerHash: text("viewer_hash"),
    source: text("source").default("direct"),
    referrer: text("referrer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_views_job_idx").on(t.jobId),
    index("job_views_created_idx").on(t.createdAt),
  ],
);
