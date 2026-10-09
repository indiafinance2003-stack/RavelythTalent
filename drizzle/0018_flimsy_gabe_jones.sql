CREATE TABLE "company_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"website_url" text NOT NULL,
	"domain" text DEFAULT '' NOT NULL,
	"city" text,
	"state" text,
	"industry" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"contact_form_url" text,
	"crawl_error" text,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_form_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"form_url" text NOT NULL,
	"prepared_message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"done_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"email" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"source_url" text,
	"mx_ok" boolean DEFAULT false NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD COLUMN "crawl_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD COLUMN "crawl_per_run" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD COLUMN "contact_form_template" text DEFAULT 'Hello {{company}} team,

We help companies like yours reach qualified candidates on Ravelyth Talent (ravelyth.in). May I send you a short overview of our hiring plans?

Thank you,
Ravelyth Talent' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_targets" ADD CONSTRAINT "company_targets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_form_queue" ADD CONSTRAINT "contact_form_queue_target_id_company_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."company_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_emails" ADD CONSTRAINT "target_emails_target_id_company_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."company_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_targets_domain_key" ON "company_targets" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "company_targets_status_idx" ON "company_targets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "company_targets_last_crawled_idx" ON "company_targets" USING btree ("last_crawled_at");--> statement-breakpoint
CREATE INDEX "contact_form_queue_status_idx" ON "contact_form_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contact_form_queue_target_idx" ON "contact_form_queue" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "target_emails_target_email_key" ON "target_emails" USING btree ("target_id","email");--> statement-breakpoint
CREATE INDEX "target_emails_target_idx" ON "target_emails" USING btree ("target_id");