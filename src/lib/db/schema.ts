import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';

/**
 * Users. Email is stored normalized (lowercase, trimmed) and unique at the
 * database level. Passwords are only ever stored as Argon2id hashes.
 *
 * `role` supports the Ravelyth Talent portal roles in addition to the original
 * DNS-tools roles:
 *   - 'candidate' — job seeker on Ravelyth Talent
 *   - 'employer'  — company user on Ravelyth Talent
 *   - 'staff'/'owner' — platform administrators
 *   - 'customer'  — original DNS tools account (retained, not a portal role)
 *
 * Roles are NEVER client-settable: they are assigned by the registration
 * handler (candidate/employer only) or by a server-side admin/owner action.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    role: text('role').notNull().default('customer'),
    // -------------------------------------------------------------------------
    // Ravelyth Talent portal fields (additive; existing accounts are unaffected)
    // -------------------------------------------------------------------------
    /**
     * When the email address was verified. NULL means unverified. Security-
     * sensitive actions (job applications, posting) can require this without
     * ever needing the raw address re-confirmation.
     */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** 'active' | 'suspended' | 'pending_deletion' */
    accountStatus: text('account_status').notNull().default('active'),
    /** Reason an admin recorded when suspending an account (audit context). */
    suspensionReason: text('suspension_reason'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    /**
     * Brute-force protection: consecutive failed logins and the time until
     * which logins are refused for this account. Reset on success.
     */
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** Last successful sign-in IP, retained for security review only. */
    lastLoginIp: text('last_login_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_email_unique_idx').on(table.email),
    index('users_role_idx').on(table.role),
    index('users_status_idx').on(table.status),
    index('users_account_status_idx').on(table.accountStatus),
  ]
);

/**
 * Server-side sessions. Only a SHA-256 hash of the session token is stored;
 * the raw token lives exclusively in an HttpOnly cookie.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique_idx').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ]
);

/**
 * Password reset tokens. Only a SHA-256 hash of the token is stored; the raw
 * token exists exclusively in server memory, the reset URL, and the emitted
 * reset email. Tokens expire server-side after 30 minutes and are single use
 * (consumed via an atomic conditional update, so concurrent replay of the same
 * token can never succeed twice).
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
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
    uniqueIndex('password_reset_tokens_token_hash_unique_idx').on(table.tokenHash),
    index('password_reset_tokens_user_id_idx').on(table.userId),
    index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
  ]
);

/**
 * Saved analyses. Only explicitly user-initiated saves are stored. Raw email
 * headers are never persisted; email analysis is intentionally not saveable.
 */
export const savedAnalyses = pgTable(
  'saved_analyses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    analysisType: text('analysis_type').notNull(),
    target: text('target').notNull(),
    resultJson: jsonb('result_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('saved_analyses_user_id_created_at_idx').on(table.userId, table.createdAt),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type SavedAnalysisRow = typeof savedAnalyses.$inferSelect;

/** ---------------------------------------------------------------------------
 * Support tickets
 * --------------------------------------------------------------------------- */

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull().unique(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    priority: text('priority').notNull().default('normal'),
    status: text('status').notNull().default('open'),
    affectedDomain: text('affected_domain'),
    relatedTool: text('related_tool'),
    // How this ticket was created. All tickets are 'managed_support': they are
    // created by customers with an active Managed Support entitlement.
    origin: text('origin').notNull().default('managed_support'),
    // Operational classification of who is expected to resolve the issue.
    responsibility: text('responsibility').notNull().default('unassigned'),
    // Public service catalogue slug the ticket belongs to (dns-management…).
    serviceSlug: text('service_slug'),
    // Which entitlement check authorised creation (audit trail only).
    entitlementSource: text('entitlement_source'),
    // Sanitized diagnostic/tool context (never raw email headers).
    contextJson: jsonb('context_json'),
    // Internal assignment foundation (used by the Owner Admin Room).
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notifyEmail: text('notify_email'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('support_tickets_user_id_idx').on(table.userId),
    index('support_tickets_user_id_status_idx').on(table.userId, table.status),
    index('support_tickets_reference_idx').on(table.reference),
    index('support_tickets_status_priority_idx').on(table.status, table.priority),
    index('support_tickets_origin_idx').on(table.origin),
  ]
);

/** ---------------------------------------------------------------------------
 * Support messages
 * --------------------------------------------------------------------------- */

export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorRole: text('author_role').notNull(),
    // Staff author identity for replies written from the admin room. Null for
    // customer-authored messages (the customer is known from the ticket owner).
    authorUserId: uuid('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    isInternal: boolean('is_internal').notNull().default(false),
    internalNote: text('internal_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('support_messages_ticket_id_created_at_idx').on(table.ticketId, table.createdAt),
    index('support_messages_is_internal_idx').on(table.isInternal),
  ]
);

/** ---------------------------------------------------------------------------
 * Knowledge base categories
 * --------------------------------------------------------------------------- */

export const kbCategories = pgTable(
  'kb_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('kb_categories_slug_unique_idx').on(table.slug)]
);

/** ---------------------------------------------------------------------------
 * Knowledge base articles
 * --------------------------------------------------------------------------- */

export const kbArticles = pgTable(
  'kb_articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => kbCategories.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('published'),
    body: text('body').notNull(),
    bodyJson: jsonb('body_json'),
    relatedTools: jsonb('related_tools'),
    relatedArticles: jsonb('related_articles'),
    featured: boolean('featured').notNull().default(false),
    readingTimeMinutes: integer('reading_time_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('kb_articles_category_id_idx').on(table.categoryId),
    index('kb_articles_status_idx').on(table.status),
    index('kb_articles_published_at_idx').on(table.publishedAt),
  ]
);

/** ---------------------------------------------------------------------------
 * Managed support subscriptions
 * --------------------------------------------------------------------------- */

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('none'),
    plan: text('plan').notNull().default('managed_support'),
    pricePerCycle: integer('price_per_cycle'),
    currency: text('currency').notNull().default('INR'),
    billingInterval: text('billing_interval').notNull().default('monthly'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    providerSubscriptionId: text('provider_subscription_id'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('subscriptions_user_id_unique_idx').on(table.userId),
    index('subscriptions_status_idx').on(table.status),
  ]
);

/** ---------------------------------------------------------------------------
 * Invoices
 * --------------------------------------------------------------------------- */

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invoiceNumber: text('invoice_number').notNull(),
    status: text('status').notNull().default('pending'),
    amount: integer('amount'),
    currency: text('currency').notNull().default('INR'),
    description: text('description'),
    providerInvoiceId: text('provider_invoice_id'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invoices_user_id_invoice_number_unique_idx').on(table.userId, table.invoiceNumber),
    index('invoices_user_id_status_idx').on(table.userId, table.status),
    index('invoices_user_id_created_at_idx').on(table.userId, table.createdAt),
  ]
);

/** ---------------------------------------------------------------------------
 * Customer notifications
 * --------------------------------------------------------------------------- */

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_id_read_created_at_idx').on(table.userId, table.read, table.createdAt),
    index('notifications_user_id_created_at_idx').on(table.userId, table.createdAt),
  ]
);

/** ---------------------------------------------------------------------------
 * Part 3 — Control / Licensing / Agent foundations
 * --------------------------------------------------------------------------- */

/** Organizations group users for multi-tenant provider/reseller/enterprise use.
 * Not used for the default (single-tenant) deployment yet; foundation only. */
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
        uniqueIndex('organizations_slug_unique_idx').on(table.slug),
  ]
);

/** License keys grant access to Ravelyth Control capabilities.
 * Never store raw license secrets in browser code. */
export const licenses = pgTable(
  'licenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    customerId: uuid('customer_id').references(() => users.id, { onDelete: 'set null' }),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('active'),
        capabilities: jsonb('capabilities').notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('licenses_key_hash_unique_idx').on(table.keyHash),
    index('licenses_customer_id_idx').on(table.customerId),
    index('licenses_organization_id_idx').on(table.organizationId),
    index('licenses_status_idx').on(table.status),
  ]
);

/** Servers registered to Ravelyth Control. */
export const controlServers = pgTable(
  'control_servers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    registeredHost: text('registered_host'),
    status: text('status').notNull().default('active'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('control_servers_token_hash_unique_idx').on(table.tokenHash),
    index('control_servers_org_id_idx').on(table.organizationId),
    index('control_servers_status_idx').on(table.status),
  ]
);

/** Short-lived nonces for agent request signing / replay protection. */
export const agentNonces = pgTable(
  'agent_nonces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => controlServers.id, { onDelete: 'cascade' }),
    nonceHash: text('nonce_hash').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
  },
  (table) => [
    uniqueIndex('agent_nonces_nonce_hash_unique_idx').on(table.nonceHash),
    index('agent_nonces_server_id_expires_at_idx').on(table.serverId, table.expiresAt),
    index('agent_nonces_expires_at_idx').on(table.expiresAt),
  ]
);

/** Audit log for security-sensitive internal operations. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorServerId: uuid('actor_server_id').references(() => controlServers.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    description: text('description'),
    ipAddress: text('ip_address'),
        metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_actor_user_id_idx').on(table.actorUserId),
    index('audit_log_actor_server_id_idx').on(table.actorServerId),
    index('audit_log_action_idx').on(table.action),
    index('audit_log_created_at_idx').on(table.createdAt),
  ]
);

/** ---------------------------------------------------------------------------
 * Exported types
 * --------------------------------------------------------------------------- */

export type SupportTicketRow = typeof supportTickets.$inferSelect;
export type SupportMessageRow = typeof supportMessages.$inferSelect;
export type KbCategoryRow = typeof kbCategories.$inferSelect;
export type KbArticleRow = typeof kbArticles.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type OrganizationRow = typeof organizations.$inferSelect;
export type LicenseRow = typeof licenses.$inferSelect;
export type ControlServerRow = typeof controlServers.$inferSelect;
export type AgentNonceRow = typeof agentNonces.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;

/** Support ticket category options. */
export const SUPPORT_CATEGORIES = [
  'dns',
  'email',
  'website',
  'ssl_tls',
  'domain',
  'hosting',
  'security',
  'other',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/** Support ticket priority options. */
export const SUPPORT_PRIORITIES = ['low', 'normal', 'high'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

/** Support ticket status options. */
export const SUPPORT_STATUSES = ['open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/**
 * How a support ticket was created. Every customer-facing ticket requires an
 * active Managed Support entitlement; there is no public request flow.
 */
export const SUPPORT_ORIGINS = ['managed_support'] as const;
export type SupportOrigin = (typeof SUPPORT_ORIGINS)[number];

/**
 * Who is expected to resolve the ticket. Used to separate Ravelyth's own
 * responsibilities from hosting-provider infrastructure and customer-owned
 * applications.
 */
export const SUPPORT_RESPONSIBILITIES = [
  'unassigned',
  'ravelyth_control',
  'ravelyth_managed_support',
  'hosting_provider',
  'customer_application',
  'dns_provider',
  'email_provider',
  'third_party',
] as const;
export type SupportResponsibility = (typeof SUPPORT_RESPONSIBILITIES)[number];

/** Author roles used for support messages. */
export const SUPPORT_MESSAGE_AUTHOR_ROLES = ['customer', 'staff', 'system'] as const;
export type SupportMessageAuthorRole = (typeof SUPPORT_MESSAGE_AUTHOR_ROLES)[number];

/** Subscription status options. */
export const SUBSCRIPTION_STATUSES = ['none', 'trialing', 'active', 'past_due', 'canceled', 'expired', 'suspended'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Invoice status options. */
export const INVOICE_STATUSES = ['pending', 'paid', 'void', 'uncollectible'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Notification types. */
export const NOTIFICATION_TYPES = [
  'ticket_created',
  'ticket_reply',
  'ticket_status_changed',
  'subscription_created',
  'subscription_status_changed',
  'invoice_issued',
  'invoice_paid',
  'account',
  // Talent operating notifications (Owner-facing). Persisted in-app only; no
  // email is claimed while EMAIL_PROVIDER is unconfigured.
  'new_candidate_application',
  'new_client_requirement',
  'candidate_shortlisted',
  'client_submission',
  'interview_scheduled',
  'interview_completed',
  'candidate_selected',
  'offer_received',
  'candidate_joined',
  'payment_received',
  'payment_overdue',
  // ---------------------------------------------------------------------------
  // Ravelyth Talent job portal. In-app only until an email provider is
  // configured; the email channel is always dispatched through the
  // transactional email service, never inline in a route handler.
  // ---------------------------------------------------------------------------
  'email_verification',
  'application_submitted',
  'application_status_changed',
  'new_application_received',
  'job_approved',
  'job_rejected',
  'job_expiring',
  'package_purchased',
  'premium_activated',
  'security_alert',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
/** ---------------------------------------------------------------------------
 * Part 6 — Ravelyth Talent (technology recruitment vertical)
 *
 * Candidate data is private by default: nothing in this section is ever exposed
 * to an unauthenticated request. Public job pages read only the columns the
 * Owner explicitly marks publishable, and resumes are stored out-of-tree with
 * access mediated by an authenticated Owner-only route.
 * --------------------------------------------------------------------------- */

/** Recruitment clients: the companies Ravelyth Talent sources for. */
export const talentClients = pgTable(
  'talent_clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyName: text('company_name').notNull(),
    companyWebsite: text('company_website'),
    industry: text('industry'),
    companyLocation: text('company_location'),
    companySize: text('company_size'),
    contactName: text('contact_name'),
    contactDesignation: text('contact_designation'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    linkedinUrl: text('linkedin_url'),
    status: text('status').notNull().default('PROSPECT'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('talent_clients_status_idx').on(table.status),
    index('talent_clients_company_name_idx').on(table.companyName),
  ]
);

/** Recruitment jobs. `jobId` is the human-readable identifier (JOB-001). */
export const talentJobs = pgTable(
  'talent_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: text('job_id').notNull(),
    clientId: uuid('client_id').references(() => talentClients.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    employmentType: text('employment_type').notNull().default('full_time'),
    location: text('location'),
    workMode: text('work_mode').notNull().default('onsite'),
    experienceMin: integer('experience_min'),
    experienceMax: integer('experience_max'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    salaryCurrency: text('salary_currency').notNull().default('INR'),
    /** Whether the salary band may be shown on the public job page. */
    salaryPublic: boolean('salary_public').notNull().default(false),
    openings: integer('openings').notNull().default(1),
    requiredSkills: jsonb('required_skills').notNull().default([]),
    preferredSkills: jsonb('preferred_skills').notNull().default([]),
    qualification: text('qualification'),
    shift: text('shift'),
    noticePeriodRequirement: text('notice_period_requirement'),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('talent_jobs_job_id_unique_idx').on(table.jobId),
    index('talent_jobs_status_idx').on(table.status),
    index('talent_jobs_client_id_idx').on(table.clientId),
    index('talent_jobs_status_created_at_idx').on(table.status, table.createdAt),
  ]
);

/** Recruitment candidates. `candidateId` is the human-readable CAN-000001 id. */
export const talentCandidates = pgTable(
  'talent_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: text('candidate_id').notNull(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    currentLocation: text('current_location'),
    preferredLocation: text('preferred_location'),
    totalExperience: integer('total_experience'),
    relevantExperience: integer('relevant_experience'),
    currentCompany: text('current_company'),
    /** Annual CTC in integer minor units (paise). Never a float. */
    currentCtc: integer('current_ctc'),
    expectedCtc: integer('expected_ctc'),
    noticePeriod: text('notice_period'),
    highestQualification: text('highest_qualification'),
    skills: jsonb('skills').notNull().default([]),
    linkedinUrl: text('linkedin_url'),
    preferredWorkMode: text('preferred_work_mode'),
    shiftPreference: text('shift_preference'),
    relocationPreference: text('relocation_preference'),
    source: text('source').notNull().default('website'),
    /** Explicit recruitment-data consent recorded at application time. */
    consentStatus: text('consent_status').notNull().default('pending'),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    /** Owner-only free text. Never rendered on a public page. */
    internalNotes: text('internal_notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('talent_candidates_candidate_id_unique_idx').on(table.candidateId),
    index('talent_candidates_email_idx').on(table.email),
    index('talent_candidates_created_at_idx').on(table.createdAt),
    index('talent_candidates_full_name_idx').on(table.fullName),
  ]
);

/**
 * Job applications. One row per candidate/job pair, so a candidate can apply to
 * several jobs and each application keeps its own pipeline status and history.
 */
export const talentApplications = pgTable(
  'talent_applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: text('application_id').notNull(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => talentCandidates.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => talentJobs.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('website'),
    status: text('status').notNull().default('NEW'),
    recruiterNotes: text('recruiter_notes'),
    screeningNotes: text('screening_notes'),
    /** Set only when the Owner deliberately submits the candidate to a client. */
    clientSubmissionDate: timestamp('client_submission_date', { withTimezone: true }),
    /**
     * Persisted server-side record that the candidate was contacted and
     * confirmed interest and details. Set when the pipeline reaches INTERESTED
     * and required before SHORTLISTED and CLIENT_SUBMITTED.
     */
    candidateConfirmedAt: timestamp('candidate_confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('talent_applications_application_id_unique_idx').on(table.applicationId),
    uniqueIndex('talent_applications_candidate_job_unique_idx').on(
      table.candidateId,
      table.jobId
    ),
    index('talent_applications_job_id_idx').on(table.jobId),
    index('talent_applications_status_idx').on(table.status),
    index('talent_applications_candidate_id_idx').on(table.candidateId),
  ]
);

/** Interview rounds attached to an application. */
export const talentInterviews = pgTable(
  'talent_interviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => talentApplications.id, { onDelete: 'cascade' }),
    round: text('round').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    interviewType: text('interview_type').notNull().default('video'),
    meetingLink: text('meeting_link'),
    interviewer: text('interviewer'),
    status: text('status').notNull().default('SCHEDULED'),
    feedback: text('feedback'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('talent_interviews_application_id_idx').on(table.applicationId),
    index('talent_interviews_scheduled_at_idx').on(table.scheduledAt),
    index('talent_interviews_status_idx').on(table.status),
  ]
);

/** Placements (a successful hire) plus the fee/payment tracking around them. */
export const talentPlacements = pgTable(
  'talent_placements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => talentApplications.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => talentCandidates.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => talentClients.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => talentJobs.id, { onDelete: 'set null' }),
    placementDate: timestamp('placement_date', { withTimezone: true }),
    joiningDate: timestamp('joining_date', { withTimezone: true }),
    /** Annual CTC in integer minor units (paise). */
    annualCtc: integer('annual_ctc'),
    feeType: text('fee_type').notNull().default('percentage'),
    feePercentage: integer('fee_percentage'),
    fixedFee: integer('fixed_fee'),
    /** Computed fee in integer minor units; recomputed whenever inputs change. */
    feeAmount: integer('fee_amount'),
    paymentStatus: text('payment_status').notNull().default('PENDING'),
    paymentDueDate: timestamp('payment_due_date', { withTimezone: true }),
    replacementPeriodDays: integer('replacement_period_days'),
    replacementUntil: timestamp('replacement_until', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('talent_placements_application_id_unique_idx').on(table.applicationId),
    index('talent_placements_client_id_idx').on(table.clientId),
    index('talent_placements_payment_status_idx').on(table.paymentStatus),
  ]
);

/**
 * Candidate documents (resumes and other attachments).
 *
 * The file itself is NEVER stored in a public directory and the storage
 * reference is never exposed to the browser: only metadata is described here,
 * and download goes through an authenticated, Owner-only route that re-reads
 * the file from private storage.
 */
export const talentDocuments = pgTable(
  'talent_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => talentCandidates.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => talentApplications.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull().default('resume'),
    /** Sanitized original filename recorded for Owner display only. */
    originalFilename: text('original_filename').notNull(),
    /** Opaque storage key. Never a filesystem path, never public. */
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: text('checksum_sha256'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    accessCount: integer('access_count').notNull().default(0),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('talent_documents_storage_key_unique_idx').on(table.storageKey),
    index('talent_documents_candidate_id_idx').on(table.candidateId),
    index('talent_documents_application_id_idx').on(table.applicationId),
  ]
);

/** Append-only recruitment activity trail (Owner-facing operational history). */
export const talentActivityLog = pgTable(
  'talent_activity_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    summary: text('summary'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('talent_activity_log_entity_idx').on(table.entityType, table.entityId),
    index('talent_activity_log_created_at_idx').on(table.createdAt),
    index('talent_activity_log_action_idx').on(table.action),
  ]
);

/** ---------------------------------------------------------------------------
 * Talent constants and row types
 * --------------------------------------------------------------------------- */

export type TalentClientRow = typeof talentClients.$inferSelect;
export type NewTalentClientRow = typeof talentClients.$inferInsert;
export type TalentJobRow = typeof talentJobs.$inferSelect;
export type NewTalentJobRow = typeof talentJobs.$inferInsert;
export type TalentCandidateRow = typeof talentCandidates.$inferSelect;
export type NewTalentCandidateRow = typeof talentCandidates.$inferInsert;
export type TalentApplicationRow = typeof talentApplications.$inferSelect;
export type NewTalentApplicationRow = typeof talentApplications.$inferInsert;
export type TalentInterviewRow = typeof talentInterviews.$inferSelect;
export type TalentPlacementRow = typeof talentPlacements.$inferSelect;
export type TalentDocumentRow = typeof talentDocuments.$inferSelect;
export type TalentActivityRow = typeof talentActivityLog.$inferSelect;

/** Client pipeline statuses. */
export const TALENT_CLIENT_STATUSES = [
  'PROSPECT',
  'CONTACTED',
  'REPLIED',
  'CALL_SCHEDULED',
  'REQUIREMENT_RECEIVED',
  'ACTIVE_CLIENT',
  'FUTURE',
  'NOT_INTERESTED',
] as const;
export type TalentClientStatus = (typeof TALENT_CLIENT_STATUSES)[number];

/** Job posting statuses. */
export const TALENT_JOB_STATUSES = [
  'DRAFT',
  'OPEN',
  'PAUSED',
  'CLOSED',
  'FILLED',
  'CANCELLED',
] as const;
export type TalentJobStatus = (typeof TALENT_JOB_STATUSES)[number];

/** Application pipeline statuses, in lifecycle order. */
export const TALENT_APPLICATION_STATUSES = [
  'NEW',
  'SCREENING',
  'CONTACTED',
  'INTERESTED',
  'SHORTLISTED',
  'CLIENT_SUBMITTED',
  'INTERVIEW',
  'SELECTED',
  'OFFER',
  'JOINED',
  'REJECTED',
  'WITHDRAWN',
  'NO_RESPONSE',
  'ON_HOLD',
] as const;
export type TalentApplicationStatus = (typeof TALENT_APPLICATION_STATUSES)[number];

/** Interview statuses. */
export const TALENT_INTERVIEW_STATUSES = [
  'SCHEDULED',
  'COMPLETED',
  'RESCHEDULED',
  'NO_SHOW',
  'CANCELLED',
  'PASSED',
  'FAILED',
] as const;
export type TalentInterviewStatus = (typeof TALENT_INTERVIEW_STATUSES)[number];

/** Placement payment statuses. */
export const TALENT_PAYMENT_STATUSES = [
  'PENDING',
  'INVOICED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'WAIVED',
] as const;
export type TalentPaymentStatus = (typeof TALENT_PAYMENT_STATUSES)[number];

/** Fee models supported by the placement fee calculator. */
export const TALENT_FEE_TYPES = ['percentage', 'fixed', 'hybrid'] as const;
export type TalentFeeType = (typeof TALENT_FEE_TYPES)[number];

/** Recruitment consent states. Applications require 'granted'. */
export const TALENT_CONSENT_STATUSES = ['pending', 'granted', 'withdrawn'] as const;
export type TalentConsentStatus = (typeof TALENT_CONSENT_STATUSES)[number];

/** ---------------------------------------------------------------------------
 * Payments — checkout sessions
 *
 * A checkout session is created when a customer attempts to buy Managed
 * Support. It records the exact price quoted, so the amount can never be
 * tampered with between quoting and payment. Status transitions are driven
 * ONLY by verified provider events (order confirmation, webhook, signature
 * verification). No code path fakes a successful payment.
 * --------------------------------------------------------------------------- */

export const CHECKOUT_SESSION_STATUSES = [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'expired',
] as const;
export type CheckoutSessionStatus = (typeof CHECKOUT_SESSION_STATUSES)[number];

export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Plan being purchased (always 'managed_support' today; column exists so the
    // checkout is plan-aware without schema churn).
    plan: text('plan').notNull().default('managed_support'),
    currency: text('currency').notNull().default('INR'),
    // Quoted amount in minor units at checkout time. Never re-read from config
    // afterwards: the customer agreed to THIS amount.
    amountMinor: integer('amount_minor').notNull(),
    billingInterval: text('billing_interval').notNull().default('monthly'),
    status: text('status').notNull().default('pending'),
    // Provider order/session id (e.g. the Razorpay order id).
    providerSessionId: text('provider_session_id'),
    // Stable internal receipt the provider echoes back (order.receipt).
    providerReceiptId: text('provider_receipt_id'),
    // Failure/cancellation reason supplied by the provider (audit trail only).
    failureReason: text('failure_reason'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // Optional client/device metadata captured at checkout (never sensitive).
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('checkout_sessions_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('checkout_sessions_provider_session_id_idx').on(table.providerSessionId),
    index('checkout_sessions_status_idx').on(table.status),
  ]
);

/** ---------------------------------------------------------------------------
 * Customer feedback
 *
 * Submitted by any signed-in customer from the account portal. Feedback is
 * private (owner-facing) and never shown publicly.
 * --------------------------------------------------------------------------- */

export const FEEDBACK_CATEGORIES = [
  'tools',
  'dns',
  'email',
  'account',
  'billing',
  'support',
  'other',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ['new', 'acknowledged', 'addressed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const customerFeedback = pgTable(
  'customer_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    category: text('category').notNull().default('other'),
    message: text('message').notNull(),
    status: text('status').notNull().default('new'),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    handledByUserId: uuid('handled_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('customer_feedback_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('customer_feedback_status_idx').on(table.status),
  ]
);

/** ---------------------------------------------------------------------------
 * Contact submissions
 *
 * The public contact form writes here for owner review. Unauthenticated, so
 * strict rate limiting and a honeypot are enforced at the API boundary and an
 * IP fingerprint (SHA-256, never the raw address) is stored for abuse review.
 * --------------------------------------------------------------------------- */

export const CONTACT_SUBMISSION_STATUSES = ['new', 'reviewed', 'actioned', 'spam'] as const;
export type ContactSubmissionStatus = (typeof CONTACT_SUBMISSION_STATUSES)[number];

export const contactSubmissions = pgTable(
  'contact_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    status: text('status').notNull().default('new'),
    // SHA-256 fingerprint of the client IP; supports spam review without
    // storing personally identifying address data.
    ipFingerprint: text('ip_fingerprint'),
    handledByUserId: uuid('handled_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('contact_submissions_status_created_at_idx').on(table.status, table.createdAt),
    index('contact_submissions_ip_fingerprint_idx').on(table.ipFingerprint),
  ]
);

export type CheckoutSessionRow = typeof checkoutSessions.$inferSelect;
export type NewCheckoutSessionRow = typeof checkoutSessions.$inferInsert;
export type CustomerFeedbackRow = typeof customerFeedback.$inferSelect;
export type NewCustomerFeedbackRow = typeof customerFeedback.$inferInsert;
export type ContactSubmissionRow = typeof contactSubmissions.$inferSelect;
export type NewContactSubmissionRow = typeof contactSubmissions.$inferInsert;
/**
 * Ravelyth Talent job portal tables. Re-exported so Drizzle Kit sees a single
 * schema entry point (./src/lib/db/schema.ts) and the runtime drizzle() call
 * receives the complete table map.
 *
 * portal-schema.ts imports { users } from this file, so this re-export is
 * deliberately placed at the end to avoid an initialisation cycle.
 */
export * from './portal-schema';
