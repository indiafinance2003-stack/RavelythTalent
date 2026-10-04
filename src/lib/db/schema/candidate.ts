import {
  bigint,
  boolean,
  date,
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

/* -------------------------------------------------------------------------- */
/* candidate_profiles                                                         */
/* -------------------------------------------------------------------------- */

export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    headline: text("headline"),
    summary: text("summary"),
    currentCompany: text("current_company"),
    currentDesignation: text("current_designation"),
    currentLocation: text("current_location"),
    preferredLocations: jsonb("preferred_locations").$type<string[]>().default([]),
    preferredRoles: jsonb("preferred_roles").$type<string[]>().default([]),
    totalExperienceMonths: integer("total_experience_months"),
    currentSalaryPaise: bigint("current_salary_paise", { mode: "number" }),
    expectedSalaryPaise: bigint("expected_salary_paise", { mode: "number" }),
    noticePeriodDays: integer("notice_period_days"),
    dateOfBirth: date("date_of_birth"),
    gender: text("gender"),
    languages: jsonb("languages").$type<string[]>().default([]),
    linkedinUrl: text("linkedin_url"),
    githubUrl: text("github_url"),
    portfolioUrl: text("portfolio_url"),
    /** Opt-in for the recruiter resume database (Professional+ plans). */
    discoverable: boolean("discoverable").notNull().default(false),
    profileCompleteness: integer("profile_completeness").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("candidate_profiles_user_id_key").on(t.userId),
    index("candidate_profiles_discoverable_idx").on(t.discoverable),
    index("candidate_profiles_location_idx").on(t.currentLocation),
  ],
);

/* -------------------------------------------------------------------------- */
/* education                                                                  */
/* -------------------------------------------------------------------------- */

export const education = pgTable(
  "education",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateProfileId: uuid("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    degree: text("degree").notNull(),
    specialization: text("specialization"),
    institution: text("institution").notNull(),
    startYear: integer("start_year"),
    endYear: integer("end_year"),
    grade: text("grade"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("education_profile_idx").on(t.candidateProfileId)],
);

/* -------------------------------------------------------------------------- */
/* work_experience                                                            */
/* -------------------------------------------------------------------------- */

export const workExperience = pgTable(
  "work_experience",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateProfileId: uuid("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    designation: text("designation").notNull(),
    employmentType: text("employment_type"),
    location: text("location"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isCurrent: boolean("is_current").notNull().default(false),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("work_experience_profile_idx").on(t.candidateProfileId)],
);

/* -------------------------------------------------------------------------- */
/* skills (master list)                                                       */
/* -------------------------------------------------------------------------- */

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("skills_name_key").on(t.name),
    uniqueIndex("skills_slug_key").on(t.slug),
  ],
);

/* -------------------------------------------------------------------------- */
/* candidate_skills                                                           */
/* -------------------------------------------------------------------------- */

export const candidateSkills = pgTable(
  "candidate_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateProfileId: uuid("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    proficiency: integer("proficiency"),
    years: numeric("years", { precision: 4, scale: 1 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("candidate_skills_key").on(t.candidateProfileId, t.skillId),
    index("candidate_skills_skill_idx").on(t.skillId),
  ],
);

/* -------------------------------------------------------------------------- */
/* resumes (uploaded files, stored on local disk outside /public)             */
/* -------------------------------------------------------------------------- */

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    originalName: text("original_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("resumes_user_id_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/* built_resumes (paid Resume Builder documents)                              */
/* -------------------------------------------------------------------------- */

export const builtResumes = pgTable(
  "built_resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    templateKey: text("template_key").notNull().default("classic"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    isPrimary: boolean("is_primary").notNull().default(false),
    currentVersion: integer("current_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("built_resumes_user_id_idx").on(t.userId)],
);

export const builtResumeVersions = pgTable(
  "built_resume_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builtResumeId: uuid("built_resume_id")
      .notNull()
      .references(() => builtResumes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    pdfPath: text("pdf_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("built_resume_versions_key").on(t.builtResumeId, t.version),
  ],
);
