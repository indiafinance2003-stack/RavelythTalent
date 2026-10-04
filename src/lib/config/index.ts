interface Config {
  NODE_ENV: 'development' | 'production' | 'test';
  APP_URL: string;
  APP_VERSION: string;
  MAX_REQUEST_BODY_BYTES: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  TRUST_PROXY_HEADERS: boolean;
  // Which billing/payment provider is wired up. Empty means NO gateway is
  // configured: the application must then never report a successful payment.
  BILLING_PROVIDER: string;
  // Razorpay credentials. All three must be non-empty before BILLING_PROVIDER
  // is treated as configured (see src/lib/billing/providers).
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  // Internal operations.
  OWNER_EMAIL: string;
  AUDIT_LOG_RETENTION_DAYS: number;
  // Transactional email is NOT configured by default. Leaving EMAIL_PROVIDER
  // empty means the application must never claim that an email was delivered.
  EMAIL_PROVIDER: string;
  EMAIL_FROM: string;
  // Invoice numbering prefix for internal billing operations.
  INVOICE_NUMBER_PREFIX: string;
  // Part 6 — Ravelyth Talent.
  // Private directory for candidate documents. Must NOT be inside /public.
  TALENT_STORAGE_DIR: string;
  TALENT_MAX_RESUME_BYTES: number;
  // Public application submissions are unauthenticated, so they are throttled
  // per client identity rather than per account.
  TALENT_APPLICATION_RATE_LIMIT_MAX: number;
  TALENT_APPLICATION_RATE_LIMIT_WINDOW_MS: number;
  // Maximum simultaneously open applications allowed per candidate email.
  TALENT_MAX_OPEN_APPLICATIONS_PER_CANDIDATE: number;
  // -------------------------------------------------------------------------
  // Ravelyth Talent — PROFESSIONAL JOB PORTAL
  // -------------------------------------------------------------------------
  /**
   * Whether a job must be approved by an admin before it becomes publicly
   * visible. Defaults to true. This is the workflow rule the brief requires:
   * an employer must never be able to self-publish.
   */
  JOB_APPROVAL_REQUIRED: boolean;
  /** Default lifetime of a published posting, in days. */
  JOB_DEFAULT_VALIDITY_DAYS: number;
  /** Whether a candidate must verify their email before applying to a job. */
  JOB_REQUIRE_VERIFIED_EMAIL_TO_APPLY: boolean;
  /** Whether posting a job consumes one job credit. */
  JOB_CREDIT_REQUIRED: boolean;
  /**
   * Whether the monthly job-post allowance that comes with a recruiter plan is
   * enforced. Defaults to true. This is the limit the brief requires the SERVER
   * to decide, so turning it off is a deliberate operational decision rather
   * than a way to work around a full allowance.
   */
  RECRUITER_JOB_LIMIT_ENFORCED: boolean;
  /**
   * Whether an employer MUST hold an active plan before posting.
   *
   * Defaults to FALSE, which keeps an employer that only holds prepaid job
   * credits working exactly as before. A deployment that wants plan-only
   * posting sets this to true; the limit rule itself is unaffected.
   */
  RECRUITER_REQUIRE_ACTIVE_PLAN: boolean;
  /** Usage fraction (0–1) at which the "limit approaching" notice is sent. */
  RECRUITER_LIMIT_WARNING_RATIO: number;
  /** Days before renewal at which a subscription is reported as 'expiring'. */
  RECRUITER_RENEWAL_WARNING_DAYS: number;
  /** Tax applied to portal invoices, in basis points (1800 = 18% GST). */
  BILLING_TAX_RATE_BASIS_POINTS: number;
  /** Invoice number prefix for Ravelyth Talent portal invoices. */
  PORTAL_INVOICE_NUMBER_PREFIX: string;
  /** Platform name printed on invoices. */
  BILLING_ENTITY_NAME: string;
  /** Billing contact printed on invoices. */
  BILLING_ENTITY_EMAIL: string;
  /** Registered billing address printed on invoices, when supplied. */
  BILLING_ENTITY_ADDRESS: string;
  /** GSTIN printed on invoices, when supplied. */
  BILLING_ENTITY_GSTIN: string;
  /**
   * Private owner/admin bootstrap.
   *
   * `ADMIN_USERNAME` is a name, not a secret, and defaults to the platform's
   * admin handle. The credential itself is NEVER in source: it comes from
   * `ADMIN_PASSWORD_HASH` (an Argon2id hash) or `ADMIN_PASSWORD` (hashed once at
   * bootstrap and never stored, logged or returned). With neither set, no admin
   * account is created and the console stays unreachable.
   */
  ADMIN_USERNAME: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD_HASH: string;
  ADMIN_PASSWORD: string;
  /** Whether admin bootstrap can run (a credential was supplied). */
  ADMIN_BOOTSTRAP_ENABLED: boolean;
  /** Private directory for resumes, avatars and company logos. Never in /public. */
  PORTAL_STORAGE_DIR: string;
  /** Maximum accepted resume upload size, in bytes. */
  PORTAL_MAX_RESUME_BYTES: number;
  /** Maximum accepted logo/avatar upload size, in bytes. */
  PORTAL_MAX_IMAGE_BYTES: number;
  /** Accepted image MIME types for avatars/logos. */
  PORTAL_ALLOWED_IMAGE_TYPES: string;
  // Rate limits (per client identity) for the sensitive auth endpoints.
  EMAIL_VERIFICATION_RATE_LIMIT_MAX: number;
  EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS: number;
  EMAIL_VERIFICATION_RESEND_RATE_LIMIT_MAX: number;
  EMAIL_VERIFICATION_RESEND_RATE_LIMIT_WINDOW_MS: number;
  // SMTP transactional email. Blank values mean "not configured", in which case
  // the application never claims an email was delivered.
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  SMTP_REQUIRE_TLS: boolean;
  SMTP_TIMEOUT_MS: number;
  /**
   * Official Ravelyth Talent social profiles.
   *
   * Every one is OPTIONAL and empty by default. A blank or absent value means
   * "this channel is not configured", and the UI renders nothing for it rather
   * than a link to a guessed or placeholder address. Accounts are only ever
   * pointed at URLs an operator supplies, so the site can never link to a profile
   * that does not exist.
   */
  SOCIAL_X: string;
  SOCIAL_LINKEDIN: string;
  SOCIAL_GITHUB: string;
  SOCIAL_YOUTUBE: string;
  SOCIAL_INSTAGRAM: string;
  SOCIAL_FACEBOOK: string;
}

export type BillingIntervalConfig = 'monthly' | 'quarterly' | 'yearly';

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseEnvBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.trim().toLowerCase() === 'true';
}

/** Non-negative integer settings (0 is meaningful, e.g. "grace period not yet
 * decided"). */
function parseEnvNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** A ratio in [0,1]. An out-of-range or unparsable value falls back rather than
 * silently disabling a warning threshold. */
function parseEnvRatio(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) return fallback;
  return value;
}

function getConfig(): Config {
  const nodeEnv = (process.env.NODE_ENV || 'development') as
    | 'development'
    | 'production'
    | 'test';

  return {
    NODE_ENV: nodeEnv,
    APP_URL: process.env.APP_URL || 'https://ravelyth.in',
    APP_VERSION: process.env.APP_VERSION || '0.1.0',
    MAX_REQUEST_BODY_BYTES: parseEnvInt('MAX_REQUEST_BODY_BYTES', 1048576),
    RATE_LIMIT_WINDOW_MS: parseEnvInt('RATE_LIMIT_WINDOW_MS', 60000),
    RATE_LIMIT_MAX_REQUESTS: parseEnvInt('RATE_LIMIT_MAX_REQUESTS', 60),
    TRUST_PROXY_HEADERS: parseEnvBool('TRUST_PROXY_HEADERS', nodeEnv === 'production'),
    // Payments. Ravelyth Talent billing lives here; an empty BILLING_PROVIDER
    // means the application must never report a successful payment.
    BILLING_PROVIDER: (process.env.BILLING_PROVIDER || '').trim(),
    RAZORPAY_KEY_ID: (process.env.RAZORPAY_KEY_ID || '').trim(),
    RAZORPAY_KEY_SECRET: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
    RAZORPAY_WEBHOOK_SECRET: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
    // Internal operations.
    OWNER_EMAIL: (process.env.OWNER_EMAIL || '').trim(),
    AUDIT_LOG_RETENTION_DAYS: parseEnvInt('AUDIT_LOG_RETENTION_DAYS', 365),
    // Transactional email provider boundary. Empty = no delivery is possible,
    // so no notification may claim an email was sent.
    EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || '').trim(),
    EMAIL_FROM: (process.env.EMAIL_FROM || '').trim(),
    INVOICE_NUMBER_PREFIX: (process.env.INVOICE_NUMBER_PREFIX || 'RVLY').trim(),
    // Part 6 — Ravelyth Talent.
    // Default sits beside the application (never under /public) and is outside
    // version control. Candidate documents are written with owner-only
    // permissions and are only ever read through an authorised server route.
    TALENT_STORAGE_DIR: (
      process.env.TALENT_STORAGE_DIR || '.ravelyth-private/talent-documents'
    ).trim(),
    TALENT_MAX_RESUME_BYTES: parseEnvInt('TALENT_MAX_RESUME_BYTES', 5 * 1024 * 1024),
    TALENT_APPLICATION_RATE_LIMIT_MAX: parseEnvInt('TALENT_APPLICATION_RATE_LIMIT_MAX', 5),
    TALENT_APPLICATION_RATE_LIMIT_WINDOW_MS: parseEnvInt(
      'TALENT_APPLICATION_RATE_LIMIT_WINDOW_MS',
      60 * 60 * 1000
    ),
    TALENT_MAX_OPEN_APPLICATIONS_PER_CANDIDATE: parseEnvInt(
      'TALENT_MAX_OPEN_APPLICATIONS_PER_CANDIDATE',
      10
    ),
    // -------------------------------------------------------------------------
    // Ravelyth Talent — PROFESSIONAL JOB PORTAL
    // -------------------------------------------------------------------------
    // Admin approval is the default and the safe behaviour: an employer can
    // never move a job to 'published' directly.
    JOB_APPROVAL_REQUIRED: parseEnvBool('JOB_APPROVAL_REQUIRED', true),
    JOB_DEFAULT_VALIDITY_DAYS: parseEnvInt('JOB_DEFAULT_VALIDITY_DAYS', 60),
    JOB_REQUIRE_VERIFIED_EMAIL_TO_APPLY: parseEnvBool(
      'JOB_REQUIRE_VERIFIED_EMAIL_TO_APPLY',
      true
    ),
    JOB_CREDIT_REQUIRED: parseEnvBool('JOB_CREDIT_REQUIRED', true),
    // Recruiter plans. The limit is enforced by default; `RECRUITER_REQUIRE_ACTIVE_PLAN`
    // stays off so an employer holding only prepaid credits is unaffected.
    RECRUITER_JOB_LIMIT_ENFORCED: parseEnvBool('RECRUITER_JOB_LIMIT_ENFORCED', true),
    RECRUITER_REQUIRE_ACTIVE_PLAN: parseEnvBool('RECRUITER_REQUIRE_ACTIVE_PLAN', false),
    RECRUITER_LIMIT_WARNING_RATIO: parseEnvRatio('RECRUITER_LIMIT_WARNING_RATIO', 0.8),
    RECRUITER_RENEWAL_WARNING_DAYS: parseEnvInt('RECRUITER_RENEWAL_WARNING_DAYS', 7),
    BILLING_TAX_RATE_BASIS_POINTS: parseEnvNonNegativeInt(
      'BILLING_TAX_RATE_BASIS_POINTS',
      0
    ),
    PORTAL_INVOICE_NUMBER_PREFIX: (process.env.PORTAL_INVOICE_NUMBER_PREFIX || 'RVLYT').trim(),
    BILLING_ENTITY_NAME: (process.env.BILLING_ENTITY_NAME || 'Ravelyth Talent').trim(),
    BILLING_ENTITY_EMAIL: (process.env.BILLING_ENTITY_EMAIL || 'billing@ravelyth.in').trim(),
    BILLING_ENTITY_ADDRESS: (process.env.BILLING_ENTITY_ADDRESS || '').trim(),
    BILLING_ENTITY_GSTIN: (process.env.BILLING_ENTITY_GSTIN || '').trim(),
    // Admin bootstrap. The username is a name; the credential is only ever read
    // from the environment and is never written to source, logs or responses.
    ADMIN_USERNAME: (process.env.ADMIN_USERNAME || 'Liky').trim(),
    ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    ADMIN_BOOTSTRAP_ENABLED: Boolean(
      (process.env.ADMIN_PASSWORD_HASH || '').trim() || (process.env.ADMIN_PASSWORD || '').length > 0
    ),
    // Defaults beside the application, never under /public, never committed.
    PORTAL_STORAGE_DIR: (process.env.PORTAL_STORAGE_DIR || '.ravelyth-private/portal').trim(),
    PORTAL_MAX_RESUME_BYTES: parseEnvInt('PORTAL_MAX_RESUME_BYTES', 5 * 1024 * 1024),
    PORTAL_MAX_IMAGE_BYTES: parseEnvInt('PORTAL_MAX_IMAGE_BYTES', 2 * 1024 * 1024),
    PORTAL_ALLOWED_IMAGE_TYPES: (
      process.env.PORTAL_ALLOWED_IMAGE_TYPES || 'image/png,image/jpeg,image/webp'
    )
      .trim()
      .toLowerCase(),
    EMAIL_VERIFICATION_RATE_LIMIT_MAX: parseEnvInt('EMAIL_VERIFICATION_RATE_LIMIT_MAX', 3),
    EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS: parseEnvInt(
      'EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS',
      60 * 60 * 1000
    ),
    EMAIL_VERIFICATION_RESEND_RATE_LIMIT_MAX: parseEnvInt(
      'EMAIL_VERIFICATION_RESEND_RATE_LIMIT_MAX',
      3
    ),
    EMAIL_VERIFICATION_RESEND_RATE_LIMIT_WINDOW_MS: parseEnvInt(
      'EMAIL_VERIFICATION_RESEND_RATE_LIMIT_WINDOW_MS',
      60 * 60 * 1000
    ),
    // SMTP. Any blank value means delivery is not configured.
    SMTP_HOST: (process.env.SMTP_HOST || '').trim(),
    SMTP_PORT: parseEnvInt('SMTP_PORT', 587),
    SMTP_USER: (process.env.SMTP_USER || '').trim(),
    SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
    SMTP_REQUIRE_TLS: parseEnvBool('SMTP_REQUIRE_TLS', true),
    SMTP_TIMEOUT_MS: parseEnvInt('SMTP_TIMEOUT_MS', 15000),
    // Trimmed and empty-by-default. An unconfigured channel yields an empty
    // string, which the social-links helper treats as "render nothing".
    SOCIAL_X: (process.env.SOCIAL_X || '').trim(),
    SOCIAL_LINKEDIN: (process.env.SOCIAL_LINKEDIN || '').trim(),
    SOCIAL_GITHUB: (process.env.SOCIAL_GITHUB || '').trim(),
    SOCIAL_YOUTUBE: (process.env.SOCIAL_YOUTUBE || '').trim(),
    SOCIAL_INSTAGRAM: (process.env.SOCIAL_INSTAGRAM || '').trim(),
    SOCIAL_FACEBOOK: (process.env.SOCIAL_FACEBOOK || '').trim(),
  };
}

export const config = getConfig();
