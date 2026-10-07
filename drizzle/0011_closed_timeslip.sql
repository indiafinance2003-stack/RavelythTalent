CREATE TABLE "ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_faq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"model" text DEFAULT 'claude-haiku-4-5' NOT NULL,
	"monthly_spend_cap_usd" integer DEFAULT 0 NOT NULL,
	"auto_send_safe_replies" boolean DEFAULT false NOT NULL,
	"signature_text" text,
	"business_description" text,
	"opt_out_text" text DEFAULT 'Reply to this email with unsubscribe to opt out.' NOT NULL,
	"daily_send_cap" integer DEFAULT 15 NOT NULL,
	"send_window_start" text DEFAULT '10:00' NOT NULL,
	"send_window_end" text DEFAULT '17:00' NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"contact_name" text,
	"designation" text,
	"email" text NOT NULL,
	"phone" text,
	"website" text,
	"city" text,
	"state" text,
	"industry" text,
	"source" text,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"last_contacted_at" timestamp with time zone,
	"next_followup_at" timestamp with time zone,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"uid_validity" text,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"category" text NOT NULL,
	"urgency" text,
	"summary" text,
	"needs_human" boolean DEFAULT false NOT NULL,
	"confidence" integer,
	"source" text DEFAULT 'rules' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"body" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"thread_id" uuid NOT NULL,
	"remote_uid" integer,
	"message_id" text,
	"in_reply_to" text,
	"references" text,
	"from_address" text NOT NULL,
	"to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '(no subject)' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"attachment_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"direction" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"subject" text DEFAULT '(no subject)' NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"category" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"lead_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sender_account_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"followup_sequence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressed_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_faq" ADD CONSTRAINT "assistant_faq_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD CONSTRAINT "assistant_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_lead_id_company_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."company_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_leads" ADD CONSTRAINT "company_leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_classifications" ADD CONSTRAINT "inbox_classifications_thread_id_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."inbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_drafts" ADD CONSTRAINT "inbox_drafts_thread_id_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."inbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_drafts" ADD CONSTRAINT "inbox_drafts_account_id_inbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."inbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_drafts" ADD CONSTRAINT "inbox_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_account_id_inbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."inbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_thread_id_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."inbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_account_id_inbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."inbox_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_threads" ADD CONSTRAINT "inbox_threads_lead_id_company_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."company_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_company_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."company_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_sender_account_id_inbox_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."inbox_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressed_emails" ADD CONSTRAINT "suppressed_emails_lead_id_company_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."company_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assistant_faq_active_idx" ON "assistant_faq" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_messages_campaign_lead_step_key" ON "campaign_messages" USING btree ("campaign_id","lead_id","step");--> statement-breakpoint
CREATE INDEX "campaign_messages_status_scheduled_idx" ON "campaign_messages" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "campaign_messages_lead_idx" ON "campaign_messages" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_leads_email_key" ON "company_leads" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "company_leads_status_idx" ON "company_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "company_leads_company_idx" ON "company_leads" USING btree ("company");--> statement-breakpoint
CREATE INDEX "company_leads_followup_idx" ON "company_leads" USING btree ("next_followup_at");--> statement-breakpoint
CREATE INDEX "inbox_classifications_thread_idx" ON "inbox_classifications" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "inbox_drafts_thread_idx" ON "inbox_drafts" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_messages_account_message_id_key" ON "inbox_messages" USING btree ("account_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_messages_account_uid_key" ON "inbox_messages" USING btree ("account_id","remote_uid");--> statement-breakpoint
CREATE INDEX "inbox_messages_thread_idx" ON "inbox_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_messages_in_reply_to_idx" ON "inbox_messages" USING btree ("in_reply_to");--> statement-breakpoint
CREATE INDEX "inbox_threads_account_idx" ON "inbox_threads" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "inbox_threads_status_idx" ON "inbox_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inbox_threads_attention_idx" ON "inbox_threads" USING btree ("needs_attention");--> statement-breakpoint
CREATE INDEX "inbox_threads_category_idx" ON "inbox_threads" USING btree ("category");--> statement-breakpoint
CREATE INDEX "inbox_threads_last_message_idx" ON "inbox_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "inbox_threads_lead_idx" ON "inbox_threads" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_events_lead_idx" ON "lead_events" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "outreach_campaigns_status_idx" ON "outreach_campaigns" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressed_emails_email_key" ON "suppressed_emails" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "suppressed_emails_created_idx" ON "suppressed_emails" USING btree ("created_at");