import {
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
import {
  companyMemberRoleEnum,
  companyMemberStatusEnum,
  companySizeEnum,
  companyStatusEnum,
  moderationStatusEnum,
  reviewStatusEnum,
} from "./enums";

export type CompanyLocation = {
  city: string;
  state?: string;
  country?: string;
};

/* -------------------------------------------------------------------------- */
/* companies                                                                  */
/* -------------------------------------------------------------------------- */

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name"),
    slug: text("slug").notNull(),
    about: text("about"),
    industry: text("industry"),
    size: companySizeEnum("size"),
    website: text("website"),
    websiteDomain: text("website_domain"),
    foundedYear: integer("founded_year"),
    logoPath: text("logo_path"),
    locations: jsonb("locations").$type<CompanyLocation[]>().default([]),
    headquarters: text("headquarters"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    normalizedContactPhone: text("normalized_contact_phone"),
    freeJobPostsUsed: integer("free_job_posts_used").notNull().default(0),
    gstin: text("gstin"),
    status: companyStatusEnum("status").notNull().default("pending"),
    statusReason: text("status_reason"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    averageRating: numeric("average_rating", { precision: 3, scale: 2 }),
    reviewsCount: integer("reviews_count").notNull().default(0),
    isFeatured: boolean("is_featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("companies_slug_key").on(t.slug),
    index("companies_status_idx").on(t.status),
    index("companies_owner_idx").on(t.ownerUserId),
    index("companies_normalized_name_idx").on(t.normalizedName),
    index("companies_website_domain_idx").on(t.websiteDomain),
    index("companies_normalized_phone_idx").on(t.normalizedContactPhone),
  ],
);

/* -------------------------------------------------------------------------- */
/* company_members                                                            */
/* -------------------------------------------------------------------------- */

export const companyMembers = pgTable(
  "company_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email"),
    role: companyMemberRoleEnum("role").notNull().default("recruiter"),
    status: companyMemberStatusEnum("status").notNull().default("active"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    inviteTokenHash: text("invite_token_hash"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_members_company_user_key").on(t.companyId, t.userId),
    index("company_members_user_idx").on(t.userId),
    index("company_members_company_idx").on(t.companyId),
  ],
);

/* -------------------------------------------------------------------------- */
/* company_verification_documents                                             */
/* -------------------------------------------------------------------------- */

export const companyVerificationDocuments = pgTable(
  "company_verification_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    originalName: text("original_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: moderationStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("company_verification_documents_company_idx").on(t.companyId)],
);

/* -------------------------------------------------------------------------- */
/* company_reviews (moderated before publishing)                              */
/* -------------------------------------------------------------------------- */

export const companyReviews = pgTable(
  "company_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    title: text("title"),
    pros: text("pros"),
    cons: text("cons"),
    body: text("body").notNull(),
    status: reviewStatusEnum("status").notNull().default("pending"),
    moderationNotes: text("moderation_notes"),
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("company_reviews_company_idx").on(t.companyId),
    index("company_reviews_status_idx").on(t.status),
    uniqueIndex("company_reviews_company_user_key").on(t.companyId, t.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* saved_candidates (Professional+ resume database)                           */
/* -------------------------------------------------------------------------- */

export const savedCandidates = pgTable(
  "saved_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    savedByUserId: uuid("saved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_candidates_key").on(t.companyId, t.candidateUserId),
    index("saved_candidates_company_idx").on(t.companyId),
  ],
);
