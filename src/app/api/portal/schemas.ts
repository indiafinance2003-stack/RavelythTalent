import { z } from 'zod';
import { emailSchema, nameSchema } from '@/lib/auth/schemas';
import { passwordSchema } from '@/lib/auth/password';

/**
 * Request validation for the Ravelyth Talent API.
 *
 * Every route handler parses its input through one of these schemas BEFORE
 * touching the database, so two endpoints cannot drift into validating the same
 * field differently.
 *
 * Note what is NOT here: a role that can be 'admin', a price, a credit count
 * or a target user id. Those are never accepted from a client — the services
 * read them from the database.
 */

/** accountType is the public-facing name for the account role. */
export const accountTypeSchema = z.enum(['candidate', 'employer'], {
  errorMap: () => ({ message: 'accountType must be candidate or employer.' }),
});

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    accountType: accountTypeSchema,
    /**
     * Explicit acceptance of the terms and privacy policy. Required, not
     * defaulted: a registration that has not affirmatively accepted must not
     * create a consent record claiming that it did.
     */
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms and privacy policy.' }),
    }),
    /**
     * Purpose-specific opt-ins. `job_application` and `resume_storage` gate the
     * candidate's core flows and so are refused when absent. `marketing` is
     * strictly opt-in: omitting it means NO marketing consent is recorded.
     */
    consents: z
      .object({
        jobApplication: z.boolean().optional(),
        resumeStorage: z.boolean().optional(),
        marketing: z.boolean().optional(),
      })
      .strict()
      .nullish(),
    // Only meaningful for an employer account.
    company: z
      .object({
        name: z.string().min(1).max(160),
        website: z.string().url().max(300).nullish(),
        industry: z.string().max(80).nullish(),
        companySize: z.string().max(40).nullish(),
        location: z.string().max(120).nullish(),
      })
      .nullish(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => (data.accountType === 'employer' ? Boolean(data.company) : !data.company), {
    message: 'A company is required for an employer account and not allowed otherwise.',
    path: ['company'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  // The full policy is applied on the way in, so a short legacy password still
  // produces a clear validation message instead of a confusing 500.
  password: z.string().min(1).max(200),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** Profile update. Every field is optional; unknown keys are rejected. */
export const profileUpdateSchema = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
    phone: z.string().max(32).nullish(),
    location: z.string().max(120).nullish(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
      .nullish(),
    headline: z.string().max(160).nullish(),
    summary: z.string().max(4000).nullish(),
    currentCompany: z.string().max(120).nullish(),
    currentJobTitle: z.string().max(120).nullish(),
    totalExperienceYears: z.number().int().min(0).max(70).nullish(),
    currentCtcMinor: z.number().int().min(0).nullish(),
    expectedCtcMinor: z.number().int().min(0).nullish(),
    noticePeriodDays: z.number().int().min(0).max(365).nullish(),
    portfolioUrl: z.string().url().max(300).nullish(),
    linkedinUrl: z.string().url().max(300).nullish(),
    githubUrl: z.string().url().max(300).nullish(),
    profileVisibility: z.enum(['public', 'employers', 'private']).optional(),
    openToWork: z.boolean().optional(),
  })
  .strict();

export const applySchema = z
  .object({
    jobId: z.string().uuid(),
    resumeVersionId: z.string().uuid().nullish(),
    coverLetter: z.string().max(5000).nullish(),
  })
  .strict();

export const applicationStatusSchema = z
  .object({
    status: z.enum(['applied', 'shortlisted', 'interview', 'selected', 'rejected', 'hired']),
    note: z.string().max(1000).nullish(),
    employerNotes: z.string().max(5000).nullish(),
  })
  .strict();

export const jobCreateSchema = z
  .object({
    title: z.string().min(2).max(160),
    description: z.string().min(10).max(20000),
    department: z.string().max(120).nullish(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']),
    experienceMinYears: z.number().int().min(0).max(70).nullish(),
    experienceMaxYears: z.number().int().min(0).max(70).nullish(),
    location: z.string().max(120).nullish(),
    workMode: z.enum(['onsite', 'hybrid', 'remote']),
    // Money is integer minor units (paise) — never a float.
    salaryMinMinor: z.number().int().min(0).nullish(),
    salaryMaxMinor: z.number().int().min(0).nullish(),
    salaryPublic: z.boolean().optional(),
    openings: z.number().int().min(1).max(1000).optional(),
    responsibilities: z.array(z.string().max(500)).max(30).optional(),
    requirements: z.array(z.string().max(500)).max(30).optional(),
    benefits: z.array(z.string().max(500)).max(30).optional(),
    educationRequirements: z.string().max(500).nullish(),
    skills: z.array(z.string().min(1).max(60)).max(50).optional(),
    applicationDeadline: z.string().datetime().nullish(),
    /**
     * Client company id, supplied ONLY by a recruitment agency posting on a
     * client's behalf.
     *
     * This is a REQUEST, never a grant: the service checks it against the
     * agency's active client links and refuses an unauthorised agency outright.
     */
    postedForCompanyId: z.string().uuid().nullish(),
  })
  .strict()
  .refine(
    (data) =>
      data.experienceMinYears == null ||
      data.experienceMaxYears == null ||
      data.experienceMinYears <= data.experienceMaxYears,
    {
      message: 'Minimum experience cannot exceed maximum experience.',
      path: ['experienceMinYears'],
    }
  )
  .refine(
    (data) =>
      data.salaryMinMinor == null ||
      data.salaryMaxMinor == null ||
      data.salaryMinMinor <= data.salaryMaxMinor,
    { message: 'Minimum salary cannot exceed maximum salary.', path: ['salaryMinMinor'] }
  );

/**
 * Job edit. Every field is optional.
 *
 * `postedForCompanyId` is deliberately NOT editable: re-pointing an already
 * published vacancy at a different client would bypass the agency authorisation
 * check that ran at creation time, letting a posting silently change whose
 * vacancy it claims to be.
 *
 * Declared independently rather than derived from `jobCreateSchema`, because
 * that schema is wrapped in cross-field refinements which cannot be made
 * partial. The field rules here deliberately mirror it.
 */
export const jobUpdateSchema = z
  .object({
    title: z.string().min(2).max(160),
    description: z.string().min(10).max(20000),
    department: z.string().max(120).nullish(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']),
    experienceMinYears: z.number().int().min(0).max(70).nullish(),
    experienceMaxYears: z.number().int().min(0).max(70).nullish(),
    location: z.string().max(120).nullish(),
    workMode: z.enum(['onsite', 'hybrid', 'remote']),
    salaryMinMinor: z.number().int().min(0).nullish(),
    salaryMaxMinor: z.number().int().min(0).nullish(),
    salaryPublic: z.boolean().optional(),
    openings: z.number().int().min(1).max(1000).optional(),
    responsibilities: z.array(z.string().max(500)).max(30).optional(),
    requirements: z.array(z.string().max(500)).max(30).optional(),
    benefits: z.array(z.string().max(500)).max(30).optional(),
    educationRequirements: z.string().max(500).nullish(),
    skills: z.array(z.string().min(1).max(60)).max(50).optional(),
    applicationDeadline: z.string().datetime().nullish(),
  })
  .strict()
  .partial()
  .refine(
    (data) =>
      data.experienceMinYears == null ||
      data.experienceMaxYears == null ||
      data.experienceMinYears <= data.experienceMaxYears,
    { message: 'Minimum experience cannot exceed maximum experience.', path: ['experienceMinYears'] }
  )
  .refine(
    (data) =>
      data.salaryMinMinor == null ||
      data.salaryMaxMinor == null ||
      data.salaryMinMinor <= data.salaryMaxMinor,
    { message: 'Minimum salary cannot exceed maximum salary.', path: ['salaryMinMinor'] }
  );

/**
 * Order creation.
 *
 * There is deliberately NO amount or price field: the price is read from the
 * package row server-side, so a client cannot influence what is charged.
 */
export const createOrderSchema = z
  .object({
    packageId: z.string().uuid(),
    nonRefundableAccepted: z.literal(true, {
      errorMap: () => ({
        message: 'You must accept the job package purchase terms to continue.',
      }),
    }),
  })
  .strict();

/**
 * Recruiter plan checkout.
 *
 * As with `createOrderSchema` there is deliberately NO price field: the amount
 * is computed from the plan row and the configured tax rate server-side. The
 * client names which plan and which billing period it wants — and nothing else.
 */
export const createPlanCheckoutSchema = z
  .object({
    planId: z.string().uuid(),
    billingPeriod: z.enum(['monthly', 'annual'], {
      errorMap: () => ({ message: 'billingPeriod must be monthly or annual.' }),
    }),
    nonRefundableAccepted: z.literal(true, {
      errorMap: () => ({
        message: 'You must accept the subscription purchase terms to continue.',
      }),
    }),
  })
  .strict();

/**
 * Interview scheduling.
 *
 * No candidate id or company id: both are derived server-side from the
 * application and the caller's session, so a request can never schedule
 * somebody else's interview.
 */
export const scheduleInterviewSchema = z
  .object({
    applicationId: z.string().uuid(),
    mode: z.enum(['video', 'phone', 'onsite']),
    scheduledAt: z.coerce.date({
      errorMap: () => ({ message: 'scheduledAt must be a valid ISO date.' }),
    }),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    round: z.number().int().min(1).max(50).optional(),
    locationOrLink: z.string().max(500).nullish(),
    notes: z.string().max(4000).nullish(),
  })
  .strict();

export const updateInterviewSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('reschedule'),
      scheduledAt: z.coerce.date({
        errorMap: () => ({ message: 'scheduledAt must be a valid ISO date.' }),
      }),
      durationMinutes: z.number().int().min(5).max(480).optional(),
      mode: z.enum(['video', 'phone', 'onsite']).optional(),
      locationOrLink: z.string().max(500).nullish(),
      note: z.string().max(1000).nullish(),
    })
    .strict(),
  z
    .object({
      action: z.literal('status'),
      status: z.enum(['completed', 'cancelled', 'no_show']),
      notes: z.string().max(4000).nullish(),
    })
    .strict(),
]);

/** Agency submission: put a candidate forward for a client's job. */
export const submitCandidateSchema = z
  .object({
    jobId: z.string().uuid(),
    candidateId: z.string().uuid(),
    notes: z.string().max(4000).nullish(),
  })
  .strict();

export const updateSubmissionSchema = z
  .object({
    status: z.enum(['under_review', 'client_interview', 'client_selected', 'rejected', 'withdrawn']),
    note: z.string().max(2000).nullish(),
  })
  .strict();

export const reviewJobSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    // Required in practice when rejecting; the service enforces that.
    reason: z.string().max(1000).nullish(),
  })
  .strict();

export const reportSchema = z
  .object({
    targetType: z.enum(['job', 'company', 'employer', 'candidate']),
    targetId: z.string().min(1).max(64),
    reason: z.enum([
      'inappropriate_content',
      'misleading_or_scam',
      'discriminatory',
      'spam_or_duplicate',
      'copyright_or_trademark',
      'other',
    ]),
    description: z.string().max(2000).nullish(),
  })
  .strict();

export const consentSchema = z
  .object({
    purpose: z.enum([
      'account_creation',
      'job_application',
      'resume_storage',
      'employer_sharing',
      'recruitment_services',
      'marketing',
    ]),
    policyVersion: z.string().min(1).max(40),
    policyReference: z.string().max(300).nullish(),
  })
  .strict();


