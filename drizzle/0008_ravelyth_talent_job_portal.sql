CREATE TABLE "application_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"achieved_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issued_on" date,
	"expires_on" date,
	"credential_id" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"degree" text,
	"field_of_study" text,
	"start_year" integer,
	"end_year" integer,
	"grade" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"subscription_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "candidate_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"location" text,
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"proficiency" text DEFAULT 'professional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"preferred_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_job_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_work_modes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_salary_minor" integer,
	"alert_frequency" text DEFAULT 'daily' NOT NULL,
	"job_alert_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_premium_plan_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_premium_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"billing_period" text DEFAULT 'monthly' NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_premium_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"provider_subscription_id" text,
	"order_id" uuid,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"location" text,
	"date_of_birth" date,
	"headline" text,
	"summary" text,
	"avatar_storage_key" text,
	"current_company" text,
	"current_job_title" text,
	"total_experience_years" integer,
	"current_ctc_minor" integer,
	"expected_ctc_minor" integer,
	"notice_period_days" integer,
	"portfolio_url" text,
	"linkedin_url" text,
	"github_url" text,
	"profile_visibility" text DEFAULT 'employers' NOT NULL,
	"open_to_work" boolean DEFAULT true NOT NULL,
	"profile_completion" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"url" text,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"proficiency" text DEFAULT 'intermediate' NOT NULL,
	"years_of_experience" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"official_email" text,
	"phone" text,
	"website" text,
	"industry" text,
	"company_size" text,
	"location" text,
	"description" text,
	"logo_storage_key" text,
	"authorized_contact_name" text,
	"authorized_contact_email" text,
	"authorized_contact_phone" text,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verification_notes" text,
	"verified_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_company_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"job_title" text,
	"is_primary_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"keywords" text,
	"location" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_min_years" integer,
	"experience_max_years" integer,
	"employment_type" text,
	"work_mode" text,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_matched_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"resume_version_id" uuid,
	"cover_letter" text,
	"status" text DEFAULT 'applied' NOT NULL,
	"employer_notes" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"order_id" uuid,
	"job_id" uuid,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_package_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"feature_value" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "job_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"credits" integer DEFAULT 1 NOT NULL,
	"validity_days" integer DEFAULT 90 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"experience_min_years" integer,
	"experience_max_years" integer,
	"location" text,
	"work_mode" text DEFAULT 'onsite' NOT NULL,
	"salary_min_minor" integer,
	"salary_max_minor" integer,
	"salary_currency" text DEFAULT 'INR' NOT NULL,
	"salary_public" boolean DEFAULT false NOT NULL,
	"openings" integer DEFAULT 1 NOT NULL,
	"description" text NOT NULL,
	"responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"education_requirements" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"application_deadline" timestamp with time zone,
	"job_credit_ledger_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"order_type" text DEFAULT 'job_package' NOT NULL,
	"candidate_id" uuid,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_order_id" text,
	"non_refundable_accepted" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"provider_signature" text,
	"method" text,
	"failure_reason" text,
	"authorized_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premium_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruitment_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"candidate_id" uuid,
	"requirement" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_notes" text,
	"resolution" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_version_id" uuid NOT NULL,
	"viewer_user_id" uuid,
	"application_id" uuid,
	"access_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_premium" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" text,
	"content_json" jsonb,
	"pdf_storage_key" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"label" text NOT NULL,
	"template_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"policy_version" text NOT NULL,
	"policy_reference" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'processed' NOT NULL,
	"payload_json" jsonb,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_ip" text;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_achievements" ADD CONSTRAINT "candidate_achievements_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_certifications" ADD CONSTRAINT "candidate_certifications_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_entitlements" ADD CONSTRAINT "candidate_entitlements_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_entitlements" ADD CONSTRAINT "candidate_entitlements_entitlement_id_premium_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."premium_entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_entitlements" ADD CONSTRAINT "candidate_entitlements_subscription_id_candidate_premium_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."candidate_premium_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experiences" ADD CONSTRAINT "candidate_experiences_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_preferences" ADD CONSTRAINT "candidate_preferences_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_premium_plan_entitlements" ADD CONSTRAINT "candidate_premium_plan_entitlements_plan_id_candidate_premium_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."candidate_premium_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_premium_plan_entitlements" ADD CONSTRAINT "candidate_premium_plan_entitlements_entitlement_id_premium_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."premium_entitlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_premium_subscriptions" ADD CONSTRAINT "candidate_premium_subscriptions_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_premium_subscriptions" ADD CONSTRAINT "candidate_premium_subscriptions_plan_id_candidate_premium_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."candidate_premium_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_projects" ADD CONSTRAINT "candidate_projects_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_company_members" ADD CONSTRAINT "employer_company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_company_members" ADD CONSTRAINT "employer_company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_company_members" ADD CONSTRAINT "employer_company_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD CONSTRAINT "employer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_profiles" ADD CONSTRAINT "employer_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_credit_ledger" ADD CONSTRAINT "job_credit_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_credit_ledger" ADD CONSTRAINT "job_credit_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_credit_ledger" ADD CONSTRAINT "job_credit_ledger_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_credit_ledger" ADD CONSTRAINT "job_credit_ledger_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_package_features" ADD CONSTRAINT "job_package_features_package_id_job_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."job_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_package_id_job_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."job_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_leads" ADD CONSTRAINT "recruitment_leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_leads" ADD CONSTRAINT "recruitment_leads_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_leads" ADD CONSTRAINT "recruitment_leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_access_logs" ADD CONSTRAINT "resume_access_logs_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_access_logs" ADD CONSTRAINT "resume_access_logs_viewer_user_id_users_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_template_id_resume_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."resume_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_status_history_application_id_created_at_idx" ON "application_status_history" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_achievements_candidate_id_idx" ON "candidate_achievements" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_certifications_candidate_id_idx" ON "candidate_certifications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_education_candidate_id_idx" ON "candidate_education" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_entitlements_candidate_id_entitlement_id_unique_idx" ON "candidate_entitlements" USING btree ("candidate_id","entitlement_id");--> statement-breakpoint
CREATE INDEX "candidate_entitlements_candidate_id_idx" ON "candidate_entitlements" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_experiences_candidate_id_idx" ON "candidate_experiences" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_experiences_candidate_id_is_current_idx" ON "candidate_experiences" USING btree ("candidate_id","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_languages_candidate_id_name_unique_idx" ON "candidate_languages" USING btree ("candidate_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_preferences_candidate_id_unique_idx" ON "candidate_preferences" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_premium_plan_entitlements_unique_idx" ON "candidate_premium_plan_entitlements" USING btree ("plan_id","entitlement_id");--> statement-breakpoint
CREATE INDEX "candidate_premium_plan_entitlements_entitlement_id_idx" ON "candidate_premium_plan_entitlements" USING btree ("entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_premium_plans_code_unique_idx" ON "candidate_premium_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "candidate_premium_plans_is_active_idx" ON "candidate_premium_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "candidate_premium_subscriptions_candidate_id_idx" ON "candidate_premium_subscriptions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_premium_subscriptions_status_idx" ON "candidate_premium_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidate_premium_subscriptions_plan_id_idx" ON "candidate_premium_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_profiles_user_id_unique_idx" ON "candidate_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "candidate_profiles_open_to_work_idx" ON "candidate_profiles" USING btree ("open_to_work");--> statement-breakpoint
CREATE INDEX "candidate_profiles_location_idx" ON "candidate_profiles" USING btree ("location");--> statement-breakpoint
CREATE INDEX "candidate_profiles_experience_idx" ON "candidate_profiles" USING btree ("total_experience_years");--> statement-breakpoint
CREATE INDEX "candidate_projects_candidate_id_idx" ON "candidate_projects" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_skills_candidate_id_name_unique_idx" ON "candidate_skills" USING btree ("candidate_id","name");--> statement-breakpoint
CREATE INDEX "candidate_skills_name_idx" ON "candidate_skills" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_unique_idx" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "companies_verification_status_idx" ON "companies" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "companies_industry_idx" ON "companies" USING btree ("industry");--> statement-breakpoint
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_unique_idx" ON "email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_company_members_company_id_user_id_unique_idx" ON "employer_company_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "employer_company_members_user_id_idx" ON "employer_company_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_profiles_user_id_unique_idx" ON "employer_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employer_profiles_company_id_idx" ON "employer_profiles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_alerts_candidate_id_idx" ON "job_alerts" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "job_alerts_is_active_frequency_idx" ON "job_alerts" USING btree ("is_active","frequency");--> statement-breakpoint
CREATE UNIQUE INDEX "job_applications_job_id_candidate_id_unique_idx" ON "job_applications" USING btree ("job_id","candidate_id");--> statement-breakpoint
CREATE INDEX "job_applications_candidate_id_idx" ON "job_applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "job_applications_job_id_status_idx" ON "job_applications" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "job_applications_status_idx" ON "job_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_applications_applied_at_idx" ON "job_applications" USING btree ("applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_credit_ledger_order_id_unique_idx" ON "job_credit_ledger" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_credit_ledger_job_id_unique_idx" ON "job_credit_ledger" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_credit_ledger_company_id_created_at_idx" ON "job_credit_ledger" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "job_credit_ledger_reason_idx" ON "job_credit_ledger" USING btree ("reason");--> statement-breakpoint
CREATE UNIQUE INDEX "job_package_features_package_id_feature_key_unique_idx" ON "job_package_features" USING btree ("package_id","feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "job_packages_code_unique_idx" ON "job_packages" USING btree ("code");--> statement-breakpoint
CREATE INDEX "job_packages_status_idx" ON "job_packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_status_history_job_id_created_at_idx" ON "job_status_history" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_status_published_at_idx" ON "jobs" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "jobs_location_idx" ON "jobs" USING btree ("location");--> statement-breakpoint
CREATE INDEX "jobs_work_mode_idx" ON "jobs" USING btree ("work_mode");--> statement-breakpoint
CREATE INDEX "jobs_employment_type_idx" ON "jobs" USING btree ("employment_type");--> statement-breakpoint
CREATE INDEX "jobs_salary_min_idx" ON "jobs" USING btree ("salary_min_minor");--> statement-breakpoint
CREATE INDEX "jobs_application_deadline_idx" ON "jobs" USING btree ("application_deadline");--> statement-breakpoint
CREATE INDEX "jobs_created_by_user_id_idx" ON "jobs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_company_id_created_at_idx" ON "orders" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_provider_order_id_idx" ON "orders" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "orders_candidate_id_idx" ON "orders" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_id_unique_idx" ON "payments" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_provider_order_id_idx" ON "payments" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "platform_settings_updated_at_idx" ON "platform_settings" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "premium_entitlements_code_unique_idx" ON "premium_entitlements" USING btree ("code");--> statement-breakpoint
CREATE INDEX "recruitment_leads_status_idx" ON "recruitment_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recruitment_leads_company_id_idx" ON "recruitment_leads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "reports_status_created_at_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_type_target_id_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_user_id_idx" ON "reports" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "resume_access_logs_resume_version_id_created_at_idx" ON "resume_access_logs" USING btree ("resume_version_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_templates_code_unique_idx" ON "resume_templates" USING btree ("code");--> statement-breakpoint
CREATE INDEX "resume_templates_is_active_idx" ON "resume_templates" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_resume_id_version_number_unique_idx" ON "resume_versions" USING btree ("resume_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_storage_key_unique_idx" ON "resume_versions" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "resume_versions_resume_id_created_at_idx" ON "resume_versions" USING btree ("resume_id","created_at");--> statement-breakpoint
CREATE INDEX "resumes_candidate_id_idx" ON "resumes" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "resumes_candidate_id_is_default_idx" ON "resumes" USING btree ("candidate_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_jobs_candidate_id_job_id_unique_idx" ON "saved_jobs" USING btree ("candidate_id","job_id");--> statement-breakpoint
CREATE INDEX "saved_jobs_candidate_id_created_at_idx" ON "saved_jobs" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_consents_user_id_purpose_unique_idx" ON "user_consents" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "user_consents_purpose_idx" ON "user_consents" USING btree ("purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_id_unique_idx" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_event_type_idx" ON "webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_account_status_idx" ON "users" USING btree ("account_status");