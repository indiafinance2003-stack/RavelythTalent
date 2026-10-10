import { pgEnum } from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Identity & auth                                                            */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", [
  "job_seeker",
  "recruiter",
  "admin",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "deactivated",
]);

export const oauthProviderEnum = pgEnum("oauth_provider", ["google"]);

export const otpPurposeEnum = pgEnum("otp_purpose", [
  "login",
  "phone_verification",
]);

/* -------------------------------------------------------------------------- */
/* Companies                                                                  */
/* -------------------------------------------------------------------------- */

export const companyStatusEnum = pgEnum("company_status", [
  "pending",
  "approved",
  "rejected",
  "suspended",
]);

export const companyMemberRoleEnum = pgEnum("company_member_role", [
  "owner",
  "admin",
  "recruiter",
]);

export const companyMemberStatusEnum = pgEnum("company_member_status", [
  "invited",
  "active",
  "removed",
]);

export const moderationStatusEnum = pgEnum("moderation_status", [
  "pending",
  "approved",
  "rejected",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "published",
  "rejected",
]);

/* -------------------------------------------------------------------------- */
/* Jobs                                                                       */
/* -------------------------------------------------------------------------- */

export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "pending_approval",
  "published",
  "rejected",
  "paused",
  "closed",
  "expired",
]);

export const jobTypeEnum = pgEnum("job_type", [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "freelance",
]);

export const workModeEnum = pgEnum("work_mode", ["remote", "hybrid", "onsite"]);

export const salaryPeriodEnum = pgEnum("salary_period", [
  "year",
  "month",
  "day",
  "hour",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "viewed",
  "shortlisted",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export const alertFrequencyEnum = pgEnum("alert_frequency", ["daily", "weekly"]);

export const interviewModeEnum = pgEnum("interview_mode", [
  "video",
  "phone",
  "in_person",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "scheduled",
  "confirmed",
  "rescheduled",
  "cancelled",
  "completed",
  "no_show",
]);

/* -------------------------------------------------------------------------- */
/* Billing                                                                    */
/* -------------------------------------------------------------------------- */

export const planAudienceEnum = pgEnum("plan_audience", [
  "candidate",
  "employer",
]);

export const billingPeriodEnum = pgEnum("billing_period", ["monthly", "yearly"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "pending",
  "active",
  "expired",
  "cancelled",
  "halted",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
]);

export const paymentPurposeEnum = pgEnum("payment_purpose", [
  "subscription",
  "addon",
  "internship_post",
]);

/* -------------------------------------------------------------------------- */
/* Internships                                                                */
/* -------------------------------------------------------------------------- */

export const stipendTypeEnum = pgEnum("stipend_type", [
  "paid",
  "unpaid",
  "performance_based",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "issued",
  "paid",
  "void",
]);

export const addonTypeEnum = pgEnum("addon_type", [
  "per_job",
  "per_company",
  "subscription",
]);

/* -------------------------------------------------------------------------- */
/* Platform                                                                   */
/* -------------------------------------------------------------------------- */

export const emailStatusEnum = pgEnum("email_status", [
  "queued",
  "sent",
  "failed",
  "suppressed",
]);

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "published",
]);

export const supportStatusEnum = pgEnum("support_status", [
  "open",
  "in_progress",
  "closed",
]);

export const companySizeEnum = pgEnum("company_size", [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10000+",
]);
