/**
 * Types mirroring the Ravelyth Talent backend contracts.
 *
 * These describe what the API actually returns. They are hand-written to match
 * the route handlers rather than generated, and every field the backend omits is
 * marked nullable rather than invented, so the UI cannot render a value the
 * server never sent.
 */

export type PortalRole = 'candidate' | 'employer' | 'admin';
export type CompanyType = 'employer' | 'recruitment_agency';
export type JobStatus =
  | 'draft'
  | 'pending_approval'
  | 'published'
  | 'closed'
  | 'expired'
  | 'rejected';
export type ApplicationStatus =
  | 'applied'
  | 'shortlisted'
  | 'interview'
  | 'selected'
  | 'rejected'
  | 'hired';
export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'internship'
  | 'freelance';
export type WorkMode = 'onsite' | 'hybrid' | 'remote';
export type OrderStatus = 'created' | 'paid' | 'failed' | 'cancelled' | 'expired';

/** GET /api/portal/auth/me */
export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  emailVerified: boolean;
  candidateProfile?: { id: string; fullName: string };
  profileCompletion?: number;
  subscription?: CandidateSubscription | null;
  entitlements?: EntitlementDTO[];
}

export interface CandidateSubscription {
  id: string;
  planCode: string;
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface EntitlementDTO {
  code: string;
  name: string;
  description: string | null;
  expiresAt: string | null;
}

/** GET /api/portal/jobs */
export interface JobListItem {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  location: string | null;
  workMode: WorkMode;
  employmentType: EmploymentType;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  salaryMinMinor: number | null;
  salaryMaxMinor: number | null;
  salaryPublic: boolean;
  openings: number;
  skills: string[];
  status: string;
  publishedAt: string | null;
  applicationDeadline: string | null;
}

export interface PublicJobDetail extends JobListItem {
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  educationRequirements: string | null;
  department: string | null;
  expiresAt: string | null;
}

export interface JobSearchResult {
  items: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface JobFacets {
  locations: string[];
  skills: string[];
  employmentTypes: string[];
  workModes: string[];
}

/** GET /api/portal/companies/[id] */
export interface PublicCompanyProfile {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  companySize: string | null;
  location: string | null;
  description: string | null;
  website: string | null;
  verificationStatus: string;
  openJobs: number;
}

/** Recruiter plan billing period. Annual plans are charged as one order. */
export type BillingPeriod = 'monthly' | 'annual';

/** Interview states. See `INTERVIEW_STATUSES`. */
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

/** How an interview will be conducted. */
export type InterviewMode = 'video' | 'phone' | 'onsite';

/** Where an agency submission currently stands. See `AGENCY_SUBMISSION_STATUSES`. */
export type AgencySubmissionStatus =
  | 'submitted'
  | 'under_review'
  | 'client_interview'
  | 'client_selected'
  | 'rejected'
  | 'withdrawn';

/**
 * GET /api/portal/plans — the public recruiter catalogue.
 *
 * This mirrors the `recruiter_plans` rows that checkout charges against, so the
 * prices rendered here are the same numbers the server will quote.
 */
export interface RecruiterPlanDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthlyMinor: number;
  priceAnnualMinor: number;
  annualListPriceMinor: number | null;
  jobPostsPerMonth: number;
  currency: string;
  supportTier: string;
  isEnterprise: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
}

/**
 * Allowance arithmetic for the current billing period.
 *
 * `level` is the server's own verdict, so a screen must not recompute it: the
 * dashboard and the posting-limit check read the same number.
 */
export interface AllowanceUsage {
  allowance: number;
  used: number;
  remaining: number;
  percentUsed: number;
  level: 'ok' | 'warning' | 'exhausted';
}

export interface CompanySubscriptionDTO {
  id: string;
  status: string;
  billingPeriod: string;
  amountMinor: number;
  currency: string;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  renewalAt: string | null;
  cancelAtPeriodEnd: boolean;
  planCode: string;
  planName: string;
}

/** One append-only entry in the subscription's lifecycle history. */
export interface SubscriptionEventDTO {
  id: string;
  eventType: string;
  fromPlanId: string | null;
  toPlanId: string | null;
  billingPeriod: string | null;
  amountMinor: number | null;
  notes: string | null;
  createdAt: string;
}

/**
 * GET /api/portal/employer/subscription.
 *
 * `canPost` is the server's decision, not a client-side guess: it already
 * accounts for the plan requirement, the enforcement flag and the credit
 * overflow. A screen that re-derived it could disagree with what actually
 * happens when a job is submitted.
 */
export interface CompanyPlanOverview {
  subscription: CompanySubscriptionDTO | null;
  plan: RecruiterPlanDTO | null;
  features: string[];
  usage: AllowanceUsage | null;
  creditsAvailable: number;
  postsRemaining: number;
  limitEnforced: boolean;
  requiresActivePlan: boolean;
  canPost: boolean;
  events?: SubscriptionEventDTO[];
}

/** An invoice as the company sees it. Mirrors the server's `InvoiceDTO`. */
export interface PortalInvoiceDTO {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  planCode: string | null;
  description: string;
  billingPeriod: string | null;
  status: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxRateBasisPoints: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string | null;
  customerGstin: string | null;
  placeOfSupply: string | null;
  paymentReference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  paidAt: string | null;
}

/**
 * GET /api/portal/employer/interviews.
 *
 * `notes` is interviewer notes and appears ONLY on employer-facing responses;
 * the candidate DTO omits the field entirely rather than nulling it.
 */
export interface InterviewDTO {
  id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  companyId: string;
  round: number;
  mode: InterviewMode;
  scheduledAt: string;
  durationMinutes: number;
  locationOrLink: string | null;
  notes?: string | null;
  status: InterviewStatus;
  jobTitle: string;
  candidateName: string;
  createdAt: string;
  updatedAt: string;
}

/** The candidate's view: identical, minus the employer-only notes. */
export type CandidateInterviewDTO = Omit<InterviewDTO, 'notes'>;

/** One entry from GET /api/portal/employer/interviews/[id]. */
export interface InterviewHistoryEntry {
  id: string;
  eventType: string;
  scheduledAt: string | null;
  note: string | null;
  createdAt: string;
}

/** GET /api/portal/employer/saved-candidates — the company shortlist. */
export interface SavedCandidateDTO {
  id: string;
  candidateId: string;
  fullName: string;
  headline: string | null;
  currentJobTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  openToWork: boolean;
  notes: string | null;
  savedAt: string;
}

/**
 * GET /api/portal/employer/agency-submissions.
 *
 * `asAgency` says which side of the relationship the caller is looking from,
 * because the permitted next statuses differ: the agency withdraws, the client
 * decides.
 */
export interface AgencySubmissionDTO {
  id: string;
  status: AgencySubmissionStatus;
  agencyCompanyId: string;
  agencyName: string;
  clientCompanyId: string;
  clientName: string;
  jobId: string;
  jobTitle: string;
  candidateId: string;
  candidateName: string;
  applicationId: string | null;
  notes: string | null;
  submittedAt: string;
  updatedAt: string;
  asAgency: boolean;
}

/** One entry from GET /api/portal/employer/agency-submissions/[id]. */
export interface AgencySubmissionEventDTO {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

/** GET/PUT /api/portal/candidate/profile */
export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  location: string | null;
  dateOfBirth: string | null;
  headline: string | null;
  summary: string | null;
  currentCompany: string | null;
  currentJobTitle: string | null;
  totalExperienceYears: number | null;
  currentCtcMinor: number | null;
  expectedCtcMinor: number | null;
  noticePeriodDays: number | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  profileVisibility: 'public' | 'employers' | 'private';
  openToWork: boolean;
  profileCompletion: number;
}

export interface ProfileCompletion {
  percentage: number;
  missing: string[];
}

export interface ProfileResponse {
  profile: CandidateProfile;
  completion: ProfileCompletion;
}

export interface CandidateSkill {
  id: string;
  name: string;
  displayName: string;
  proficiency: string | null;
  yearsOfExperience: number | null;
}

export interface CandidateLanguage {
  id: string;
  name: string;
  displayName?: string;
  proficiency: string | null;
}

export interface CandidateEducation {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startYear: number | null;
  endYear: number | null;
  grade: string | null;
  description: string | null;
}

export interface CandidateExperience {
  id: string;
  company: string;
  title: string;
  employmentType: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface CandidateProject {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  technologies: string[];
  startDate: string | null;
  endDate: string | null;
}

export interface CandidateCertification {
  id: string;
  name: string;
  issuer: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  credentialId: string | null;
  url: string | null;
}

export interface CandidateAchievement {
  id: string;
  title: string;
  description: string | null;
  achievedOn: string | null;
}

export interface CandidateDetails {
  skills: CandidateSkill[];
  languages: CandidateLanguage[];
  education: CandidateEducation[];
  experience: CandidateExperience[];
  projects: CandidateProject[];
  certifications: CandidateCertification[];
  achievements: CandidateAchievement[];
}

/** Union of the section names the details endpoint accepts as 	ype. */
export type DetailsSection =
  | 'skill'
  | 'language'
  | 'education'
  | 'experience'
  | 'project'
  | 'certification'
  | 'achievement';

export interface CandidatePreferences {
  candidateId: string;
  preferredLocations: string[];
  preferredJobTypes: string[];
  preferredWorkModes: string[];
  preferredIndustries: string[];
  minSalaryMinor: number | null;
  alertFrequency: string;
  jobAlertEnabled: boolean;
}

/** GET /api/portal/candidate/resumes */
export interface ResumeSummary {
  id: string;
  label: string;
  isDefault: boolean;
  templateCode: string | null;
  latestVersion: number | null;
  latestUploadedAt: string | null;
  createdAt: string;
}

export interface ResumeTemplate {
  code: string;
  name: string;
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  contentJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApplicationDTO {
  id: string;
  jobId: string;
  candidateId: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  appliedAt: string;
  updatedAt: string;
  jobTitle?: string;
  companyName?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string | null;
  candidateLocation?: string | null;
  candidateHeadline?: string | null;
  employerNotes?: string | null;
}

export interface StatusHistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

export interface SavedJob {
  jobId: string;
  title: string;
  companyName: string;
  location: string | null;
  workMode: string;
  employmentType: string;
  salaryMinMinor: number | null;
  salaryMaxMinor: number | null;
  salaryPublic: boolean;
  status: string;
  savedAt: string;
}

/** A saved job alert, as stored. */
export interface JobAlert {
  id: string;
  name: string;
  keywords: string | null;
  location: string | null;
  skills: string[];
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  employmentType: string | null;
  workMode: string | null;
  frequency: string;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

/** A candidate premium plan. Price is authoritative from the database. */
export interface PremiumPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  durationDays: number;
  billingPeriod: string;
  isActive: boolean;
  sortOrder: number;
  entitlements: Array<{ id?: string; code: string; name: string; description?: string | null }>;
}

/** A recorded consent decision for one purpose. */
export interface ConsentRecord {
  id: string;
  purpose: string;
  policyVersion: string;
  acceptedAt: string;
  withdrawnAt: string | null;
}

/** An in-app notification row. */
export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** A job row as the owning employer sees it, including workflow state. */
export interface EmployerJob {
  id: string;
  companyId: string;
  postedForCompanyId: string | null;
  title: string;
  department: string | null;
  employmentType: string;
  workMode: string;
  location: string | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  salaryMinMinor: number | null;
  salaryMaxMinor: number | null;
  salaryPublic: boolean;
  openings: number;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  educationRequirements: string | null;
  skills: string[];
  status: string;
  rejectionReason: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  applicationDeadline: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An application as the employer sees it. */
export interface EmployerApplication {
  id: string;
  jobId: string;
  resumeVersionId: string | null;
  candidateId: string;
  status: string;
  coverLetter: string | null;
  employerNotes: string | null;
  appliedAt: string;
  updatedAt: string;
  jobTitle?: string;
  companyName?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string | null;
  candidateLocation?: string | null;
  candidateHeadline?: string | null;
}

/** An authorised client relationship for a recruitment agency. */
export interface AgencyClient {
  id: string;
  clientCompanyId: string;
  name: string;
  status: string;
  verified: boolean;
}

export interface AgencyClientsResponse {
  companyType: CompanyType | null;
  clients: AgencyClient[];
}

/** A job credit balance, derived from the ledger by the server. */
export interface CreditBalance {
  total: number;
  used: number;
  available: number;
  earliestExpiry: string | null;
}

/** The employer's own company record. */
export interface EmployerCompany {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  location: string | null;
  description: string | null;
  phone: string | null;
  officialEmail: string | null;
  authorizedContactName: string | null;
  authorizedContactPhone: string | null;
  verificationStatus: string;
  verificationNotes: string | null;
  companyType: CompanyType;
  status: string;
}
/** A purchasable job credit package. */
export interface JobPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  credits: number;
  validityDays: number;
  status: string;
}

/** A purchase order. Paid only via a verified gateway callback. */
export interface OrderDTO {
  id: string;
  orderNumber: string;
  packageId: string;
  amountMinor: number;
  currency: string;
  status: OrderStatus;
  paidAt: string | null;
  createdAt: string;
  nonRefundableAccepted: boolean;
  providerOrderId?: string | null;
}

/** One line of the append-only job credit ledger. */
export interface CreditLedgerEntry {
  id: string;
  amount: number;
  reason: string;
  notes: string | null;
  jobId: string | null;
  orderId: string | null;
  createdAt: string;
}

/* ==========================================================================
   Admin console shapes.
   ========================================================================== */

/** Aggregate platform counters for the admin dashboard. */
export interface PlatformStats {
  candidates: number;
  employers: number;
  companies: number;
  verifiedCompanies: number;
  activeJobs: number;
  pendingApprovalJobs: number;
  totalApplications: number;
  hires: number;
  paidOrders: number;
  revenueMinor: number;
  activePackages: number;
  activePremiumSubscriptions: number;
  openReports: number;
  suspendedUsers: number;
}

/** One point in a daily activity series. */
export interface DailyPoint {
  day: string;
  value: number;
}

/** A registration series point, broken down by role. */
export interface RegistrationPoint extends DailyPoint {
  role: string;
}

/** An account row in the admin user list. */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  accountStatus: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** A company row in the admin company list. */
export interface AdminCompanyRow {
  id: string;
  name: string;
  companyType: CompanyType;
  verificationStatus: string;
  verificationNotes: string | null;
  website: string | null;
  officialEmail: string | null;
  phone: string | null;
  location: string | null;
  industry: string | null;
  companySize: string | null;
  description: string | null;
  createdAt: string;
}

/** A job row in the admin job list (mirrors the `jobs` table). */
export interface AdminJobRow {
  id: string;
  title: string;
  department: string | null;
  status: JobStatus;
  employmentType: EmploymentType;
  workMode: WorkMode;
  location: string | null;
  companyId: string;
  postedForCompanyId: string | null;
  createdByUserId: string;
  openings: number;
  salaryPublic: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  rejectionReason: string | null;
}

/** A report row in the admin report queue (mirrors the `reports` table). */
export interface AdminReportRow {
  id: string;
  reporterUserId: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  description: string;
  status: string;
  adminNotes: string | null;
  resolution: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** One audit log entry, as the admin console sees it. */
export interface AuditLogEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  actorServerId: string | null;
  description: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

/** A candidate premium plan in the admin catalogue. */
export interface PremiumPlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  billingPeriod: string;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
}

/** A platform setting key/value row. `value` is JSONB, not a string. */
export interface PlatformSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

/** A job credit package in the admin catalogue. */
export interface AdminJobPackageRow extends JobPackage {
  createdAt: string;
  updatedAt: string;
}

/** A platform-wide application row, as the admin console sees it. */
export interface AdminApplicationRow {
  id: string;
  jobId: string;
  jobTitle: string;
  companyId: string;
  candidateId: string;
  status: string;
  coverLetter: string | null;
  employerNotes: string | null;
  appliedAt: string;
  updatedAt: string;
}

/** One payment attempt recorded against an order. */
export interface PaymentAttemptRow {
  id: string;
  orderId: string;
  status: string;
  amountMinor: number;
  currency: string;
  provider: string | null;
  providerPaymentId: string | null;
  method: string | null;
  failureReason: string | null;
  createdAt: string;
}

/** An order plus every payment attempt recorded against it. */
export interface AdminPaymentRow {
  order: OrderDTO & {
    orderType: string;
    companyId: string;
    candidateId: string | null;
    providerOrderId: string | null;
  };
  payments: PaymentAttemptRow[];
}

