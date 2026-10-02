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
