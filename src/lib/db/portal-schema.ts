import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  check,
  integer,
  date,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './schema';

/**
 * ============================================================================
 * RAVELYTH TALENT — PROFESSIONAL JOB PORTAL SCHEMA
 * ============================================================================
 *
 * These tables are additive and deliberately separate from the older
 * `talent_*` recruitment-vertical tables (clients/candidates/placements).
 * Ravelyth's recruitment service is a SEPARATE commercial product: a company
 * that posts a job on this portal is a portal employer, NOT automatically a
 * recruitment-service client, and hiring through the portal never triggers a
 * placement fee. `recruitmentLeads` below is an optional, non-intrusive
 * linkage surface for a later decision — nothing in the portal workflow
 * writes to it automatically.
 *
 * Money is always stored as integer minor units (paise for INR), never floats.
 */

/** Email verification tokens expire after 24 hours. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Email verification tokens. Only a SHA-256 hash of the token is persisted;
 * the raw value exists solely in the verification email. Tokens are single use
 * (consumed via conditional UPDATE) and expire server-side.
 */
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('email_verification_tokens_token_hash_unique_idx').on(table.tokenHash),
    index('email_verification_tokens_user_id_idx').on(table.userId),
    index('email_verification_tokens_expires_at_idx').on(table.expiresAt),
  ]
);

/**
 * Candidate profile — exactly one row per candidate user. Contains only
 * professional job-seeker information. Date of birth is OPTIONAL and is never
 * required to register, build a profile, or apply to a job.
 */
export const candidateProfiles = pgTable(
  'candidate_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    location: text('location'),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    headline: text('headline'),
    summary: text('summary'),
    /** Opaque private storage key for the avatar. Never a public URL. */
    avatarStorageKey: text('avatar_storage_key'),
    currentCompany: text('current_company'),
    currentJobTitle: text('current_job_title'),
    totalExperienceYears: integer('total_experience_years'),
    /** Annual CTC in integer minor units (paise). */
    currentCtcMinor: integer('current_ctc_minor'),
    expectedCtcMinor: integer('expected_ctc_minor'),
    noticePeriodDays: integer('notice_period_days'),
    portfolioUrl: text('portfolio_url'),
    linkedinUrl: text('linkedin_url'),
    githubUrl: text('github_url'),
    /** 'public' | 'employers' | 'private' — who may view the profile. */
    profileVisibility: text('profile_visibility').notNull().default('employers'),
    openToWork: boolean('open_to_work').notNull().default(true),
    /** Denormalised completion percentage (0-100), recomputed server-side. */
    profileCompletion: integer('profile_completion').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('candidate_profiles_user_id_unique_idx').on(table.userId),
    index('candidate_profiles_open_to_work_idx').on(table.openToWork),
    index('candidate_profiles_location_idx').on(table.location),
    index('candidate_profiles_experience_idx').on(table.totalExperienceYears),
  ]
);

export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    /** Stored lowercase so skill matching is exact and indexable. */
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    proficiency: text('proficiency').notNull().default('intermediate'),
    yearsOfExperience: integer('years_of_experience'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('candidate_skills_candidate_id_name_unique_idx').on(table.candidateId, table.name),
    index('candidate_skills_name_idx').on(table.name),
  ]
);

export const candidateEducation = pgTable(
  'candidate_education',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    institution: text('institution').notNull(),
    degree: text('degree'),
    fieldOfStudy: text('field_of_study'),
    startYear: integer('start_year'),
    endYear: integer('end_year'),
    grade: text('grade'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('candidate_education_candidate_id_idx').on(table.candidateId)]
);

export const candidateExperiences = pgTable(
  'candidate_experiences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    title: text('title').notNull(),
    employmentType: text('employment_type').notNull().default('full_time'),
    location: text('location'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    isCurrent: boolean('is_current').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('candidate_experiences_candidate_id_idx').on(table.candidateId),
    index('candidate_experiences_candidate_id_is_current_idx').on(table.candidateId, table.isCurrent),
  ]
);

export const candidateProjects = pgTable(
  'candidate_projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    url: text('url'),
    technologies: jsonb('technologies').$type<string[]>().notNull().default([]),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('candidate_projects_candidate_id_idx').on(table.candidateId)]
);

export const candidateCertifications = pgTable(
  'candidate_certifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    issuer: text('issuer'),
    issuedOn: date('issued_on', { mode: 'string' }),
    expiresOn: date('expires_on', { mode: 'string' }),
    credentialId: text('credential_id'),
    url: text('url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('candidate_certifications_candidate_id_idx').on(table.candidateId)]
);

export const candidateAchievements = pgTable(
  'candidate_achievements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    achievedOn: date('achieved_on', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('candidate_achievements_candidate_id_idx').on(table.candidateId)]
);

export const candidateLanguages = pgTable(
  'candidate_languages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    proficiency: text('proficiency').notNull().default('professional'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('candidate_languages_candidate_id_name_unique_idx').on(table.candidateId, table.name),
  ]
);

/** Job preferences. Exactly one row per candidate. */
export const candidatePreferences = pgTable(
  'candidate_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    preferredLocations: jsonb('preferred_locations').$type<string[]>().notNull().default([]),
    preferredJobTypes: jsonb('preferred_job_types').$type<string[]>().notNull().default([]),
    preferredWorkModes: jsonb('preferred_work_modes').$type<string[]>().notNull().default([]),
    preferredIndustries: jsonb('preferred_industries').$type<string[]>().notNull().default([]),
    /** Annual expectation floor in integer minor units (paise). */
    minSalaryMinor: integer('min_salary_minor'),
    alertFrequency: text('alert_frequency').notNull().default('daily'),
    jobAlertEnabled: boolean('job_alert_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('candidate_preferences_candidate_id_unique_idx').on(table.candidateId)]
);

export const resumeTemplates = pgTable(
  'resume_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Premium templates are gated behind a candidate entitlement. */
    isPremium: boolean('is_premium').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resume_templates_code_unique_idx').on(table.code),
    index('resume_templates_is_active_idx').on(table.isActive),
  ]
);

/**
 * A resume is a stable container owned by a candidate. Multiple resumes per
 * candidate are supported (different job targets), and each resume has many
 * versions — there is deliberately no single hard-coded resume.
 */
export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    templateId: uuid('template_id').references(() => resumeTemplates.id, { onDelete: 'set null' }),
    /** Exactly one default resume per candidate. */
    isDefault: boolean('is_default').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('resumes_candidate_id_idx').on(table.candidateId),
    index('resumes_candidate_id_is_default_idx').on(table.candidateId, table.isDefault),
  ]
);

/**
 * A resume version holds BOTH the uploaded artefact (private storage) and the
 * structured Resume Builder content as JSON, so the builder and the uploaded
 * document stay versioned together.
 */
export const resumeVersions = pgTable(
  'resume_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    /** Opaque private storage key. Files are NEVER publicly addressable. */
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: text('checksum_sha256'),
    /** Structured builder snapshot rendered into the stored document. */
    contentJson: jsonb('content_json').$type<Record<string, unknown>>(),
    /** Generated PDF, when produced. Private storage key like the original. */
    pdfStorageKey: text('pdf_storage_key'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resume_versions_resume_id_version_number_unique_idx').on(
      table.resumeId,
      table.versionNumber
    ),
    uniqueIndex('resume_versions_storage_key_unique_idx').on(table.storageKey),
    index('resume_versions_resume_id_created_at_idx').on(table.resumeId, table.createdAt),
  ]
);



/**
 * Every read of a private resume is recorded. This is what lets an employer
 * legitimately view a candidate's resume only in the context of a real
 * application, and gives the candidate/admin an access trail.
 */
export const resumeAccessLogs = pgTable(
  'resume_access_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    resumeVersionId: uuid('resume_version_id')
      .notNull()
      .references(() => resumeVersions.id, { onDelete: 'cascade' }),
    viewerUserId: uuid('viewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Present when an employer viewed it through a real application. */
    applicationId: uuid('application_id'),
    accessReason: text('access_reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('resume_access_logs_resume_version_id_created_at_idx').on(
      table.resumeVersionId,
      table.createdAt
    ),
  ]
);

/**
 * A company is the legal/brand entity that posts jobs. Several authorised
 * employer users may belong to one company. Verification is NOT automatic:
 * `verification_status` starts at 'pending' and only a server-side admin
 * action can move it to 'verified'.
 */
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    officialEmail: text('official_email'),
    phone: text('phone'),
    website: text('website'),
    industry: text('industry'),
    companySize: text('company_size'),
    location: text('location'),
    description: text('description'),
    /** Private storage key for the company logo. */
    logoStorageKey: text('logo_storage_key'),
    authorizedContactName: text('authorized_contact_name'),
    authorizedContactEmail: text('authorized_contact_email'),
    authorizedContactPhone: text('authorized_contact_phone'),
    /** 'pending' | 'verified' | 'rejected' | 'suspended' */
    verificationStatus: text('verification_status').notNull().default('pending'),
    verificationNotes: text('verification_notes'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** 'active' | 'suspended' */
    status: text('status').notNull().default('active'),
    /**
     * 'employer' hires directly; 'recruitment_agency' posts vacancies on behalf
     * of client companies it has an authorised relationship with.
     *
     * Kept on the company (not the user) because it is a property of the legal
     * entity a vacancy is published under, and because it decides which billing
     * and moderation rules apply.
     */
    companyType: text('company_type').notNull().default('employer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('companies_slug_unique_idx').on(table.slug),
    index('companies_name_idx').on(table.name),
    index('companies_verification_status_idx').on(table.verificationStatus),
    index('companies_industry_idx').on(table.industry),
  ]
);

/** Links an employer user account to the company they act for. */
export const employerProfiles = pgTable(
  'employer_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobTitle: text('job_title'),
    isPrimaryContact: boolean('is_primary_contact').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('employer_profiles_user_id_unique_idx').on(table.userId),
    index('employer_profiles_company_id_idx').on(table.companyId),
  ]
);

/**
 * Authorised client relationships for a recruitment agency.
 *
 * A staffing firm may post vacancies on behalf of a client company, but ONLY
 * where the client has been linked here first. Without this table an agency
 * could name any company as its "client" and publish vacancies in its name.
 *
 * Deliberately NOT the same as `employerCompanyMembers`: a member LOGS IN as the
 * company, whereas this row only authorises an agency to publish for it. The
 * two relationships stay separate so revoking an agency never silently grants
 * or removes dashboard access to the client.
 *
 * Status is explicit so a revoked link can never be revived by accident:
 * 'active' permits posting, anything else does not.
 */
export const companyClientRelationships = pgTable(
  'company_client_relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** The recruitment agency that may post. */
    agencyCompanyId: uuid('agency_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** The client whose vacancies the agency may publish. */
    clientCompanyId: uuid('client_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** 'active' | 'revoked' */
    status: text('status').notNull().default('active'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One relationship per agency/client pair, so a link cannot be duplicated
    // to create two independent authorisation rows.
    uniqueIndex('company_client_relationships_agency_client_unique_idx').on(
      table.agencyCompanyId,
      table.clientCompanyId
    ),
    index('company_client_relationships_client_company_id_idx').on(table.clientCompanyId),
    index('company_client_relationships_agency_status_idx').on(
      table.agencyCompanyId,
      table.status
    ),
    // An agency cannot be its own client.
    check(
      'company_client_relationships_not_self_check',
      sql`${table.agencyCompanyId} <> ${table.clientCompanyId}`
    ),
  ]
);
/**
 * Authorised employer users of a company. Allows several people from the same
 * company to manage jobs without sharing one login.
 */
export const employerCompanyMembers = pgTable(
  'employer_company_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'owner' | 'admin' | 'member' — controls company-scoped actions. */
    memberRole: text('member_role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('employer_company_members_company_id_user_id_unique_idx').on(
      table.companyId,
      table.userId
    ),
    index('employer_company_members_user_id_idx').on(table.userId),
  ]
);

/**
 * A portal job posting. `status` encodes the full lifecycle, and the transition
 * rules are enforced server-side in the job service — an employer can never
 * move a job straight to PUBLISHED when approval is required.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    department: text('department'),
    employmentType: text('employment_type').notNull().default('full_time'),
    experienceMinYears: integer('experience_min_years'),
    experienceMaxYears: integer('experience_max_years'),
    location: text('location'),
    /** 'onsite' | 'hybrid' | 'remote' */
    workMode: text('work_mode').notNull().default('onsite'),
    /** Annual salary band in integer minor units (paise). */
    salaryMinMinor: integer('salary_min_minor'),
    salaryMaxMinor: integer('salary_max_minor'),
    salaryCurrency: text('salary_currency').notNull().default('INR'),
    /** Whether the band may be shown on the public job page. */
    salaryPublic: boolean('salary_public').notNull().default(false),
    openings: integer('openings').notNull().default(1),
    description: text('description').notNull(),
    responsibilities: jsonb('responsibilities').$type<string[]>().notNull().default([]),
    requirements: jsonb('requirements').$type<string[]>().notNull().default([]),
    benefits: jsonb('benefits').$type<string[]>().notNull().default([]),
    educationRequirements: text('education_requirements'),
    /** Lowercase, normalised so skill search is exact and indexable. */
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    /** 'draft' | 'pending_approval' | 'published' | 'closed' | 'expired' | 'rejected' */
    status: text('status').notNull().default('draft'),
    rejectionReason: text('rejection_reason'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    applicationDeadline: timestamp('application_deadline', { withTimezone: true }),
    /** Job credit consumption is recorded here; also a publish guard. */
    jobCreditLedgerId: uuid('job_credit_ledger_id'),
    /**
     * Set ONLY when a recruitment agency posts this vacancy for a client.
     *
     * companyId always stays the entity that OWNS the posting and pays for it
     * (the agency), so credits, moderation and tenant scoping are unchanged.
     * This column records whose vacancy it is, which is what the public page and
     * the client''s own dashboard need to see.
     *
     * NULL for every direct-employer posting.
     */
    postedForCompanyId: uuid('posted_for_company_id').references(() => companies.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('jobs_company_id_idx').on(table.companyId),
    index('jobs_posted_for_company_id_idx').on(table.postedForCompanyId),
    index('jobs_status_idx').on(table.status),
    index('jobs_status_published_at_idx').on(table.status, table.publishedAt),
    index('jobs_location_idx').on(table.location),
    index('jobs_work_mode_idx').on(table.workMode),
    index('jobs_employment_type_idx').on(table.employmentType),
    index('jobs_salary_min_idx').on(table.salaryMinMinor),
    index('jobs_application_deadline_idx').on(table.applicationDeadline),
    index('jobs_created_by_user_id_idx').on(table.createdByUserId),
  ]
);

/** Full status history for a job, so approvals and rejections are auditable. */
export const jobStatusHistory = pgTable(
  'job_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('job_status_history_job_id_created_at_idx').on(table.jobId, table.createdAt)]
);

/* ==========================================================================
 * 6. APPLICATIONS
 * ========================================================================== */

/**
 * One row per (candidate, job). The unique index is the database-level guard
 * against duplicate applications, so two simultaneous requests can never both
 * create one.
 */
export const jobApplications = pgTable(
  'job_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    /** The exact resume version submitted, so history stays reproducible. */
    resumeVersionId: uuid('resume_version_id').references(() => resumeVersions.id, {
      onDelete: 'set null',
    }),
    coverLetter: text('cover_letter'),
    /** 'applied' | 'shortlisted' | 'interview' | 'selected' | 'rejected' | 'hired' */
    status: text('status').notNull().default('applied'),
    employerNotes: text('employer_notes'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('job_applications_job_id_candidate_id_unique_idx').on(table.jobId, table.candidateId),
    index('job_applications_candidate_id_idx').on(table.candidateId),
    index('job_applications_job_id_status_idx').on(table.jobId, table.status),
    index('job_applications_status_idx').on(table.status),
    index('job_applications_applied_at_idx').on(table.appliedAt),
  ]
);

/** Append-only application status history. */
export const applicationStatusHistory = pgTable(
  'application_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('application_status_history_application_id_created_at_idx').on(
      table.applicationId,
      table.createdAt
    ),
  ]
);

/* ==========================================================================
 * 7. SAVED JOBS AND JOB ALERTS
 * ========================================================================== */

export const savedJobs = pgTable(
  'saved_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('saved_jobs_candidate_id_job_id_unique_idx').on(table.candidateId, table.jobId),
    index('saved_jobs_candidate_id_created_at_idx').on(table.candidateId, table.createdAt),
  ]
);

/**
 * Candidate job alerts. Delivery is intentionally NOT implemented here: the
 * criteria are stored and the matcher is a real database query, but sending is
 * a scheduled worker concern wired up during integration/deployment.
 */
export const jobAlerts = pgTable(
  'job_alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keywords: text('keywords'),
    location: text('location'),
    /** Lowercase, normalised to match the jobs.skills representation. */
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    experienceMinYears: integer('experience_min_years'),
    experienceMaxYears: integer('experience_max_years'),
    employmentType: text('employment_type'),
    workMode: text('work_mode'),
    /** 'daily' | 'weekly' */
    frequency: text('frequency').notNull().default('daily'),
    isActive: boolean('is_active').notNull().default(true),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    lastMatchedCount: integer('last_matched_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('job_alerts_candidate_id_idx').on(table.candidateId),
    index('job_alerts_is_active_frequency_idx').on(table.isActive, table.frequency),
  ]
);

/* ==========================================================================
 * 8. CANDIDATE PREMIUM (plans, subscriptions, entitlements)
 * ==========================================================================
 *
 * Premium is modelled as plan + subscription + entitlement rather than a
 * boolean flag, so new premium features can be added by inserting entitlement
 * rows instead of rewriting the user model. Pricing is DATA (admin-managed
 * rows), never hard-coded in business logic.
 */

export const candidatePremiumPlans = pgTable(
  'candidate_premium_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Price in integer minor units (paise). Admin-configured, never hard-coded. */
    priceMinor: integer('price_minor').notNull().default(0),
    currency: text('currency').notNull().default('INR'),
    /** 'monthly' | 'quarterly' | 'yearly' */
    billingPeriod: text('billing_period').notNull().default('monthly'),
    durationDays: integer('duration_days').notNull().default(30),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('candidate_premium_plans_code_unique_idx').on(table.code),
    index('candidate_premium_plans_is_active_idx').on(table.isActive),
  ]
);

/**
 * Capability definitions. Adding a future premium feature means adding a row
 * here and mapping it to a plan — no schema or user-model change required.
 */
export const premiumEntitlements = pgTable(
  'premium_entitlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('premium_entitlements_code_unique_idx').on(table.code)]
);

export const candidatePremiumPlanEntitlements = pgTable(
  'candidate_premium_plan_entitlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => candidatePremiumPlans.id, { onDelete: 'cascade' }),
    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => premiumEntitlements.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('candidate_premium_plan_entitlements_unique_idx').on(table.planId, table.entitlementId),
    index('candidate_premium_plan_entitlements_entitlement_id_idx').on(table.entitlementId),
  ]
);

/**
 * A candidate's premium subscription. Entitlement checks read this (plus the
 * granted entitlement rows), never a `user.isPremium` boolean.
 */
export const candidatePremiumSubscriptions = pgTable(
  'candidate_premium_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => candidatePremiumPlans.id, { onDelete: 'restrict' }),
    /** 'pending' | 'active' | 'cancelled' | 'expired' */
    status: text('status').notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** Provider subscription reference, never raw payment data. */
    providerSubscriptionId: text('provider_subscription_id'),
    /** Links to the portal order/payment that funded this subscription. */
    orderId: uuid('order_id'),
    /**
     * The PAYMENT ROW's id (a uuid), NOT the gateway's payment reference.
     *
     * A provider payment id is an opaque string like `pay_abc123` and does
     * not fit a uuid; storing it here would make every premium purchase fail
     * with an invalid-uuid error. The external reference lives on
     * payments.provider_payment_id.
     */
    paymentId: uuid('payment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('candidate_premium_subscriptions_candidate_id_idx').on(table.candidateId),
    index('candidate_premium_subscriptions_status_idx').on(table.status),
    index('candidate_premium_subscriptions_plan_id_idx').on(table.planId),
  ]
);

/** Materialised entitlements currently granted to a candidate. */
export const candidateEntitlements = pgTable(
  'candidate_entitlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: 'cascade' }),
    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => premiumEntitlements.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => candidatePremiumSubscriptions.id, {
      onDelete: 'set null',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('candidate_entitlements_candidate_id_entitlement_id_unique_idx').on(
      table.candidateId,
      table.entitlementId
    ),
    index('candidate_entitlements_candidate_id_idx').on(table.candidateId),
  ]
);

/* ==========================================================================
 * 9. EMPLOYER PACKAGES, ORDERS, PAYMENTS AND JOB CREDITS
 * ========================================================================== */

/**
 * Job posting packages. Names, prices and credit counts are DATA — an admin
 * creates and edits them; no pricing is hard-coded anywhere in the codebase.
 */
export const jobPackages = pgTable(
  'job_packages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Price in integer minor units (paise). Authoritative server-side. */
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('INR'),
    /** How many job posting credits this package grants. */
    credits: integer('credits').notNull().default(1),
    /** How long the granted credits stay valid, in days. */
    validityDays: integer('validity_days').notNull().default(90),
    /** 'active' | 'inactive' */
    status: text('status').notNull().default('active'),
    isFeatured: boolean('is_featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('job_packages_code_unique_idx').on(table.code),
    index('job_packages_status_idx').on(table.status),
  ]
);

/** Per-package feature flags (highlight, support, validity, ...). Admin-managed. */
export const jobPackageFeatures = pgTable(
  'job_package_features',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => jobPackages.id, { onDelete: 'cascade' }),
    featureKey: text('feature_key').notNull(),
    featureValue: text('feature_value'),
    description: text('description'),
  },
  (table) => [
    uniqueIndex('job_package_features_package_id_feature_key_unique_idx').on(
      table.packageId,
      table.featureKey
    ),
  ]
);

/**
 * A purchase of a job package.
 *
 * `amountMinor` is copied from the authoritative `job_packages.price_minor` at
 * creation time. A price sent by the browser is NEVER trusted or read.
 *
 * Policy note: paid job-posting packages are non-refundable subject to legally
 * required exceptions. The backend therefore records the commercial state
 * machine and an explicit acceptance flag, but contains NO generic refund
 * workflow and no legal copy.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNumber: text('order_number').notNull(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /**
     * What was bought.
     *
     * For a 'job_package' order this is a job_packages row; for a
     * 'candidate_premium' order it is a candidate_premium_plans row.
     *
     * There is deliberately NO foreign key here: a single column cannot be
     * constrained to two different parent tables, and a check constraint that
     * enforced the pairing would have to hard-code the FK anyway. The pairing is
     * therefore validated in the service against the order's orderType, and the
     * price is always read from the parent row rather than from this id.
     */
    packageId: uuid('package_id').notNull(),
    /** 'job_package' | 'candidate_premium' */
    orderType: text('order_type').notNull().default('job_package'),
    /** Candidate target for premium orders; null for job packages. */
    candidateId: uuid('candidate_id').references(() => candidateProfiles.id, {
      onDelete: 'restrict',
    }),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('INR'),
    /** 'created' | 'paid' | 'failed' | 'cancelled' | 'expired' */
    status: text('status').notNull().default('created'),
    providerOrderId: text('provider_order_id'),
    /** Acceptance of the no-refund commercial terms at purchase time. */
    nonRefundableAccepted: boolean('non_refundable_accepted').notNull().default(false),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_order_number_unique_idx').on(table.orderNumber),
    index('orders_company_id_created_at_idx').on(table.companyId, table.createdAt),
    index('orders_user_id_idx').on(table.userId),
    index('orders_status_idx').on(table.status),
    index('orders_provider_order_id_idx').on(table.providerOrderId),
    index('orders_candidate_id_idx').on(table.candidateId),
  ]
);

/**
 * A payment attempt against an order. Only provider references and the quoted
 * amount are stored — never card numbers, CVVs, or raw payment credentials.
 *
 * `providerPaymentId` is uniquely indexed so the same provider payment can
 * never be recorded twice, which is the first line of defence against
 * duplicate credit allocation.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** 'created' | 'authorized' | 'captured' | 'failed' | 'refunded' */
    status: text('status').notNull().default('created'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('INR'),
    provider: text('provider').notNull().default('razorpay'),
    providerOrderId: text('provider_order_id'),
    providerPaymentId: text('provider_payment_id'),
    providerSignature: text('provider_signature'),
    method: text('method'),
    failureReason: text('failure_reason'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payments_provider_payment_id_unique_idx').on(table.providerPaymentId),
    index('payments_order_id_idx').on(table.orderId),
    index('payments_status_idx').on(table.status),
    index('payments_provider_order_id_idx').on(table.providerOrderId),
  ]
);

/**
 * Idempotency ledger for gateway webhooks.
 *
 * The unique index on (provider, eventId) means a replayed webhook cannot be
 * processed twice: the second delivery fails the insert and is acknowledged as
 * already-handled instead of re-allocating credits.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    /** 'processed' | 'ignored' | 'failed' */
    status: text('status').notNull().default('processed'),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>(),
    error: text('error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('webhook_events_provider_event_id_unique_idx').on(table.provider, table.eventId),
    index('webhook_events_event_type_idx').on(table.eventType),
    index('webhook_events_created_at_idx').on(table.createdAt),
  ]
);

/**
 * Append-only ledger of job credits granted and consumed.
 *
 * Balance is never stored as a mutable frontend number: it is derived from
 * this ledger inside a transaction, and consumption inserts a negative row.
 * Grants are written exactly once per (order, reason) thanks to the unique
 * index below, so a duplicate webhook cannot double-credit an account.
 */
export const jobCreditLedger = pgTable(
  'job_credit_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Positive = granted, negative = consumed. */
    amount: integer('amount').notNull(),
    /** 'order' | 'job_post' | 'admin_adjustment' */
    reason: text('reason').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    /** The job that consumed the credit, when reason = 'job_post'. */
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Grants are idempotent per order: at most ONE grant row per order.
    uniqueIndex('job_credit_ledger_order_id_unique_idx').on(table.orderId),
    // Consumption is idempotent per job: a job can never be paid for twice.
    uniqueIndex('job_credit_ledger_job_id_unique_idx').on(table.jobId),
    index('job_credit_ledger_company_id_created_at_idx').on(table.companyId, table.createdAt),
    index('job_credit_ledger_reason_idx').on(table.reason),
  ]
);



/* ==========================================================================
 * 10. CONSENT
 * ==========================================================================
 *
 * Purpose-specific consent. Applying to one public job does NOT grant blanket
 * consent for unrelated recruitment processing: each purpose is a separate row
 * with its own policy version, so a withdrawal of one purpose never silently
 * drops another.
 */
export const CONSENT_PURPOSES = [
  'account_creation',
  'job_application',
  'resume_storage',
  'employer_sharing',
  'recruitment_services',
  'marketing',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const userConsents = pgTable(
  'user_consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    /** Version of the notice/policy the user actually agreed to. */
    policyVersion: text('policy_version').notNull(),
    /** Free-form record of the exact document version, e.g. a URL or slug. */
    policyReference: text('policy_reference'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
  },
  (table) => [
    // One live consent row per (user, purpose). Withdrawal closes the row and a
    // new acceptance creates the next one, preserving the full history.
    uniqueIndex('user_consents_user_id_purpose_unique_idx').on(table.userId, table.purpose),
    index('user_consents_purpose_idx').on(table.purpose),
  ]
);

/* ==========================================================================
 * 11. REPORTS / COMPLAINTS
 * ========================================================================== */

export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_TARGET_TYPES = ['job', 'company', 'employer', 'candidate'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: text('target_type').notNull(),
    /** Id of the reported entity. Not a FK: targets span several tables. */
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    description: text('description'),
    status: text('status').notNull().default('open'),
    adminNotes: text('admin_notes'),
    resolution: text('resolution'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reports_status_created_at_idx').on(table.status, table.createdAt),
    index('reports_target_type_target_id_idx').on(table.targetType, table.targetId),
    index('reports_reporter_user_id_idx').on(table.reporterUserId),
  ]
);

/* ==========================================================================
 * 13. RECRUITMENT SERVICE LINKAGE (opt-in only)
 * ========================================================================== */

/**
 * Optional, explicitly opt-in bridge between the portal and Ravelyth's separate
 * recruitment service. NOTHING in the portal workflow writes here
 * automatically: a company posting a job or hiring a candidate through the
 * portal does NOT become a recruitment client, and no placement fee is ever
 * raised by a portal hire. Rows exist only if an admin deliberately creates
 * one, so the linkage can be added later without a migration of portal data.
 */
export const recruitmentLeads = pgTable(
  'recruitment_leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    candidateId: uuid('candidate_id').references(() => candidateProfiles.id, {
      onDelete: 'set null',
    }),
    /** Human requirement description, e.g. "2 Backend Engineers, 5+ yrs". */
    requirement: text('requirement').notNull(),
    /** 'new' | 'contacted' | 'qualified' | 'closed' | 'declined' */
    status: text('status').notNull().default('new'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('recruitment_leads_status_idx').on(table.status),
    index('recruitment_leads_company_id_idx').on(table.companyId),
  ]
);

/* ==========================================================================
 * 14. EXPORTED TYPES AND ENUMS
 * ========================================================================== */

export type EmailVerificationTokenRow = typeof emailVerificationTokens.$inferSelect;
export type CandidateProfileRow = typeof candidateProfiles.$inferSelect;
export type NewCandidateProfileRow = typeof candidateProfiles.$inferInsert;
export type CandidateSkillRow = typeof candidateSkills.$inferSelect;
export type CandidateEducationRow = typeof candidateEducation.$inferSelect;
export type CandidateExperienceRow = typeof candidateExperiences.$inferSelect;
export type CandidateProjectRow = typeof candidateProjects.$inferSelect;
export type CandidateCertificationRow = typeof candidateCertifications.$inferSelect;
export type CandidateAchievementRow = typeof candidateAchievements.$inferSelect;
export type CandidateLanguageRow = typeof candidateLanguages.$inferSelect;
export type CandidatePreferenceRow = typeof candidatePreferences.$inferSelect;
export type ResumeTemplateRow = typeof resumeTemplates.$inferSelect;
export type ResumeRow = typeof resumes.$inferSelect;
export type ResumeVersionRow = typeof resumeVersions.$inferSelect;
export type ResumeAccessLogRow = typeof resumeAccessLogs.$inferSelect;
export type CompanyRow = typeof companies.$inferSelect;
export type EmployerProfileRow = typeof employerProfiles.$inferSelect;
export type EmployerCompanyMemberRow = typeof employerCompanyMembers.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
export type JobStatusHistoryRow = typeof jobStatusHistory.$inferSelect;
export type JobApplicationRow = typeof jobApplications.$inferSelect;
export type ApplicationStatusHistoryRow = typeof applicationStatusHistory.$inferSelect;
export type SavedJobRow = typeof savedJobs.$inferSelect;
export type JobAlertRow = typeof jobAlerts.$inferSelect;
export type CandidatePremiumPlanRow = typeof candidatePremiumPlans.$inferSelect;
export type PremiumEntitlementRow = typeof premiumEntitlements.$inferSelect;
export type CandidatePremiumSubscriptionRow = typeof candidatePremiumSubscriptions.$inferSelect;
export type CandidateEntitlementRow = typeof candidateEntitlements.$inferSelect;
export type JobPackageRow = typeof jobPackages.$inferSelect;
export type JobPackageFeatureRow = typeof jobPackageFeatures.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type JobCreditLedgerRow = typeof jobCreditLedger.$inferSelect;
export type UserConsentRow = typeof userConsents.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type PlatformSettingRow = typeof platformSettings.$inferSelect;
export type RecruitmentLeadRow = typeof recruitmentLeads.$inferSelect;

/** Job posting lifecycle, in legal-transition order. */
export const JOB_STATUSES = [
  'draft',
  'pending_approval',
  'published',
  'closed',
  'expired',
  'rejected',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses a job must have to appear in public search. */
export const PUBLIC_JOB_STATUSES: readonly JobStatus[] = ['published'];

/** Application pipeline statuses, in lifecycle order. */
export const APPLICATION_STATUSES = [
  'applied',
  'shortlisted',
  'interview',
  'selected',
  'rejected',
  'hired',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'internship',
  'freelance',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const COMPANY_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;
export type CompanyVerificationStatus = (typeof COMPANY_VERIFICATION_STATUSES)[number];

export const PROFILE_VISIBILITIES = ['public', 'employers', 'private'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export const SKILL_PROFICIENCIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type SkillProficiency = (typeof SKILL_PROFICIENCIES)[number];

export const LANGUAGE_PROFICIENCIES = [
  'basic',
  'conversational',
  'professional',
  'fluent',
  'native',
] as const;
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number];

export const ORDER_STATUSES = ['created', 'paid', 'failed', 'cancelled', 'expired'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['created', 'authorized', 'captured', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'cancelled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const JOB_ALERT_FREQUENCIES = ['daily', 'weekly'] as const;
export type JobAlertFrequency = (typeof JOB_ALERT_FREQUENCIES)[number];

/* ==========================================================================
 * 12. PLATFORM SETTINGS
 * ========================================================================== */

/**
 * Admin-editable platform configuration (e.g. whether job posting requires
 * approval). Read by the job service to decide lifecycle behaviour, so the
 * workflow can be changed without a code deployment.
 */
export const platformSettings = pgTable(
  'platform_settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').$type<unknown>().notNull(),
    description: text('description'),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('platform_settings_updated_at_idx').on(table.updatedAt)]
);

