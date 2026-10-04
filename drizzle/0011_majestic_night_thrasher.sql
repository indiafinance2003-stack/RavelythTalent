CREATE TABLE "agency_submission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_company_id" uuid NOT NULL,
	"client_company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"consent_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"status" text DEFAULT 'submitted' NOT NULL,
	"notes" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"template" text,
	"recipient_email" text NOT NULL,
	"recipient_user_id" uuid,
	"status" text NOT NULL,
	"reason" text,
	"related_type" text,
	"related_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "interview_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"scheduled_by_user_id" uuid,
	"round" integer DEFAULT 1 NOT NULL,
	"mode" text DEFAULT 'video' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"location_or_link" text,
	"notes" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_post_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"job_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"consumed_by_user_id" uuid,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text
);
--> statement-breakpoint
CREATE TABLE "portal_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"tax_rate_basis_points" integer DEFAULT 0 NOT NULL,
	"is_tax_line" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid,
	"order_id" uuid,
	"subscription_id" uuid,
	"candidate_subscription_id" uuid,
	"invoice_type" text NOT NULL,
	"plan_code" text,
	"description" text NOT NULL,
	"billing_period" text,
	"status" text DEFAULT 'issued' NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"tax_rate_basis_points" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_address" text,
	"customer_gstin" text,
	"place_of_supply" text,
	"payment_reference" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"pdf_storage_key" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiter_plan_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"label" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiter_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_monthly_minor" integer NOT NULL,
	"price_annual_minor" integer NOT NULL,
	"annual_list_price_minor" integer,
	"job_posts_per_month" integer DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"support_tier" text DEFAULT 'standard' NOT NULL,
	"is_enterprise" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiter_plans_job_posts_positive_check" CHECK ("recruiter_plans"."job_posts_per_month" >= 1)
);
--> statement-breakpoint
CREATE TABLE "recruiter_subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_plan_id" uuid,
	"to_plan_id" uuid,
	"billing_period" text,
	"amount_minor" integer,
	"notes" text,
	"metadata" jsonb,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiter_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"billing_period" text DEFAULT 'monthly' NOT NULL,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"started_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"renewal_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"provider_subscription_id" text,
	"order_id" uuid,
	"payment_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"saved_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_premium_plans" ADD COLUMN "list_price_minor" integer;--> statement-breakpoint
ALTER TABLE "agency_submission_events" ADD CONSTRAINT "agency_submission_events_submission_id_agency_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."agency_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submission_events" ADD CONSTRAINT "agency_submission_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_agency_company_id_companies_id_fk" FOREIGN KEY ("agency_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_consent_id_user_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."user_consents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_submissions" ADD CONSTRAINT "agency_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_history" ADD CONSTRAINT "interview_history_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_history" ADD CONSTRAINT "interview_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_scheduled_by_user_id_users_id_fk" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post_usage" ADD CONSTRAINT "job_post_usage_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post_usage" ADD CONSTRAINT "job_post_usage_subscription_id_recruiter_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."recruiter_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post_usage" ADD CONSTRAINT "job_post_usage_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_post_usage" ADD CONSTRAINT "job_post_usage_consumed_by_user_id_users_id_fk" FOREIGN KEY ("consumed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invoice_items" ADD CONSTRAINT "portal_invoice_items_invoice_id_portal_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."portal_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invoices" ADD CONSTRAINT "portal_invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invoices" ADD CONSTRAINT "portal_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invoices" ADD CONSTRAINT "portal_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invoices" ADD CONSTRAINT "portal_invoices_subscription_id_recruiter_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."recruiter_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_invoices" ADD CONSTRAINT "portal_invoices_candidate_subscription_id_candidate_premium_subscriptions_id_fk" FOREIGN KEY ("candidate_subscription_id") REFERENCES "public"."candidate_premium_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_plan_features" ADD CONSTRAINT "recruiter_plan_features_plan_id_recruiter_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."recruiter_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscription_events" ADD CONSTRAINT "recruiter_subscription_events_subscription_id_recruiter_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."recruiter_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscription_events" ADD CONSTRAINT "recruiter_subscription_events_from_plan_id_recruiter_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."recruiter_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscription_events" ADD CONSTRAINT "recruiter_subscription_events_to_plan_id_recruiter_plans_id_fk" FOREIGN KEY ("to_plan_id") REFERENCES "public"."recruiter_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscription_events" ADD CONSTRAINT "recruiter_subscription_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscriptions" ADD CONSTRAINT "recruiter_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscriptions" ADD CONSTRAINT "recruiter_subscriptions_plan_id_recruiter_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."recruiter_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscriptions" ADD CONSTRAINT "recruiter_subscriptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscriptions" ADD CONSTRAINT "recruiter_subscriptions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiter_subscriptions" ADD CONSTRAINT "recruiter_subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_candidates" ADD CONSTRAINT "saved_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_candidates" ADD CONSTRAINT "saved_candidates_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_candidates" ADD CONSTRAINT "saved_candidates_saved_by_user_id_users_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_submission_events_submission_id_created_at_idx" ON "agency_submission_events" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_submissions_job_id_candidate_id_unique_idx" ON "agency_submissions" USING btree ("job_id","candidate_id");--> statement-breakpoint
CREATE INDEX "agency_submissions_agency_company_id_created_at_idx" ON "agency_submissions" USING btree ("agency_company_id","submitted_at");--> statement-breakpoint
CREATE INDEX "agency_submissions_client_company_id_idx" ON "agency_submissions" USING btree ("client_company_id");--> statement-breakpoint
CREATE INDEX "agency_submissions_candidate_id_idx" ON "agency_submissions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "agency_submissions_status_idx" ON "agency_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_events_event_created_at_idx" ON "email_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "email_events_status_created_at_idx" ON "email_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "email_events_recipient_user_id_idx" ON "email_events" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "email_events_related_idx" ON "email_events" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "interview_history_interview_id_created_at_idx" ON "interview_history" USING btree ("interview_id","created_at");--> statement-breakpoint
CREATE INDEX "interviews_application_id_scheduled_at_idx" ON "interviews" USING btree ("application_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_company_id_scheduled_at_idx" ON "interviews" USING btree ("company_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_candidate_id_scheduled_at_idx" ON "interviews" USING btree ("candidate_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_status_idx" ON "interviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "interviews_job_id_idx" ON "interviews" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_post_usage_job_id_unique_idx" ON "job_post_usage" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_post_usage_company_id_period_start_idx" ON "job_post_usage" USING btree ("company_id","period_start");--> statement-breakpoint
CREATE INDEX "job_post_usage_company_id_released_at_idx" ON "job_post_usage" USING btree ("company_id","released_at");--> statement-breakpoint
CREATE INDEX "portal_invoice_items_invoice_id_idx" ON "portal_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_invoices_invoice_number_unique_idx" ON "portal_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_invoices_order_id_unique_idx" ON "portal_invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "portal_invoices_user_id_issued_at_idx" ON "portal_invoices" USING btree ("user_id","issued_at");--> statement-breakpoint
CREATE INDEX "portal_invoices_company_id_issued_at_idx" ON "portal_invoices" USING btree ("company_id","issued_at");--> statement-breakpoint
CREATE INDEX "portal_invoices_status_idx" ON "portal_invoices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiter_plan_features_plan_id_feature_key_unique_idx" ON "recruiter_plan_features" USING btree ("plan_id","feature_key");--> statement-breakpoint
CREATE INDEX "recruiter_plan_features_feature_key_idx" ON "recruiter_plan_features" USING btree ("feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiter_plans_code_unique_idx" ON "recruiter_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "recruiter_plans_is_active_sort_order_idx" ON "recruiter_plans" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "recruiter_subscription_events_subscription_id_created_at_idx" ON "recruiter_subscription_events" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "recruiter_subscription_events_event_type_idx" ON "recruiter_subscription_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiter_subscriptions_company_id_unique_idx" ON "recruiter_subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "recruiter_subscriptions_status_renewal_idx" ON "recruiter_subscriptions" USING btree ("status","renewal_at");--> statement-breakpoint
CREATE INDEX "recruiter_subscriptions_plan_id_idx" ON "recruiter_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_candidates_company_id_candidate_id_unique_idx" ON "saved_candidates" USING btree ("company_id","candidate_id");--> statement-breakpoint
CREATE INDEX "saved_candidates_company_id_created_at_idx" ON "saved_candidates" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_candidates_candidate_id_idx" ON "saved_candidates" USING btree ("candidate_id");

--> statement-breakpoint
-- ==========================================================================
-- Seed: the Ravelyth Talent commercial catalogue.
--
-- These are the locked launch prices and monthly job-post allowances. They are
-- DEFAULTS, not constants: an administrator edits them in the admin console
-- afterwards, and every amount charged is read from these rows at purchase
-- time. ON CONFLICT DO NOTHING makes the migration idempotent, so re-running it
-- or installing fresh both produce exactly one catalogue.
-- ==========================================================================
INSERT INTO "premium_entitlements" ("code", "name", "description") VALUES
  ('resume_builder_premium', 'Premium Resume Builder', 'Build and maintain resumes with structured content and version history.'),
  ('professional_resume_templates', 'Professional resume templates', 'Choose from professionally designed resume layouts.'),
  ('multiple_resume_versions', 'Multiple resume versions', 'Keep several tailored resume versions and pick one per application.'),
  ('pdf_resume_export', 'Resume PDF export', 'Generate and download a formatted PDF of any resume version.'),
  ('resume_version_history', 'Resume version history', 'Review and restore previous resume versions.')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "candidate_premium_plans" ("code", "name", "description", "price_minor", "list_price_minor", "currency", "billing_period", "duration_days", "is_active", "sort_order") VALUES
  ('candidate_premium_monthly', 'Candidate Premium - Monthly', 'Everything a candidate needs to apply well: the premium Resume Builder, multiple versions and PDF export.', 49900, NULL, 'INR', 'monthly', 30, true, 10),
  ('candidate_premium_yearly', 'Candidate Premium - Yearly', 'A full year of Candidate Premium at the launch price.', 199900, 299900, 'INR', 'yearly', 365, true, 20)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "candidate_premium_plan_entitlements" ("plan_id", "entitlement_id")
SELECT p."id", e."id"
FROM "candidate_premium_plans" p
CROSS JOIN "premium_entitlements" e
WHERE p."code" IN ('candidate_premium_monthly', 'candidate_premium_yearly')
  AND e."code" IN ('resume_builder_premium', 'professional_resume_templates', 'multiple_resume_versions', 'pdf_resume_export', 'resume_version_history')
ON CONFLICT ("plan_id", "entitlement_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "recruiter_plans" ("code", "name", "description", "price_monthly_minor", "price_annual_minor", "annual_list_price_minor", "job_posts_per_month", "currency", "support_tier", "is_enterprise", "is_active", "sort_order") VALUES
  ('basic', 'Basic', 'For a company hiring a few roles at a time.', 399900, 3000000, NULL, 5, 'INR', 'standard', false, true, 10),
  ('professional', 'Professional', 'For an active hiring team running several roles in parallel.', 799900, 5000000, NULL, 15, 'INR', 'standard', false, true, 20),
  ('business', 'Business', 'For companies with a continuous hiring pipeline.', 1299900, 7000000, NULL, 25, 'INR', 'standard', false, true, 30),
  ('enterprise', 'Enterprise', 'For large and multi-team recruitment operations.', 3599900, 11500000, NULL, 50, 'INR', 'priority', true, true, 40)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "recruiter_plan_features" ("plan_id", "feature_key", "label", "sort_order")
SELECT p."id", v."feature_key", v."label", v."sort_order"
FROM (VALUES
  ('basic', 'job_posting', 'Job posting and management', 10),
  ('basic', 'company_profile', 'Company profile', 20),
  ('basic', 'applications', 'Applications inbox', 30),
  ('basic', 'candidate_management', 'Candidate management', 40),
  ('basic', 'notifications', 'Notifications and email flows', 50),
  ('professional', 'job_posting', 'Job posting and management', 10),
  ('professional', 'company_profile', 'Company profile', 20),
  ('professional', 'applications', 'Applications inbox', 30),
  ('professional', 'candidate_management', 'Candidate management', 40),
  ('professional', 'notifications', 'Notifications and email flows', 50),
  ('professional', 'advanced_candidate_search', 'Advanced candidate search and filtering', 60),
  ('professional', 'resume_database', 'Resume database', 70),
  ('professional', 'shortlisting', 'Shortlisting', 80),
  ('professional', 'saved_candidates', 'Saved candidates', 90),
  ('professional', 'interview_management', 'Interview scheduling and management', 100),
  ('professional', 'reports', 'Reports', 110),
  ('business', 'job_posting', 'Job posting and management', 10),
  ('business', 'company_profile', 'Company profile', 20),
  ('business', 'applications', 'Applications inbox', 30),
  ('business', 'candidate_management', 'Candidate management', 40),
  ('business', 'notifications', 'Notifications and email flows', 50),
  ('business', 'advanced_candidate_search', 'Advanced candidate search and filtering', 60),
  ('business', 'resume_database', 'Resume database', 70),
  ('business', 'shortlisting', 'Shortlisting', 80),
  ('business', 'saved_candidates', 'Saved candidates', 90),
  ('business', 'interview_management', 'Interview scheduling and management', 100),
  ('business', 'reports', 'Reports', 110),
  ('business', 'team_management', 'Team and recruiter management', 120),
  ('business', 'advanced_analytics', 'Advanced analytics', 130),
  ('enterprise', 'job_posting', 'Job posting and management', 10),
  ('enterprise', 'company_profile', 'Company profile', 20),
  ('enterprise', 'applications', 'Applications inbox', 30),
  ('enterprise', 'candidate_management', 'Candidate management', 40),
  ('enterprise', 'notifications', 'Notifications and email flows', 50),
  ('enterprise', 'advanced_candidate_search', 'Advanced candidate search and filtering', 60),
  ('enterprise', 'resume_database', 'Resume database', 70),
  ('enterprise', 'shortlisting', 'Shortlisting', 80),
  ('enterprise', 'saved_candidates', 'Saved candidates', 90),
  ('enterprise', 'interview_management', 'Interview scheduling and management', 100),
  ('enterprise', 'reports', 'Reports', 110),
  ('enterprise', 'team_management', 'Team and recruiter management', 120),
  ('enterprise', 'advanced_analytics', 'Advanced analytics', 130),
  ('enterprise', 'priority_support', 'Priority support', 140)
) AS v(plan_code, feature_key, label, sort_order)
JOIN "recruiter_plans" p ON p."code" = v.plan_code
ON CONFLICT ("plan_id", "feature_key") DO NOTHING;
