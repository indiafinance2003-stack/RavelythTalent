CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"platform_post_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"facebook_enabled" boolean DEFAULT true NOT NULL,
	"instagram_enabled" boolean DEFAULT true NOT NULL,
	"max_posts_per_day" integer DEFAULT 10 NOT NULL,
	"min_minutes_between_posts" integer DEFAULT 20 NOT NULL,
	"window_start" text DEFAULT '09:00' NOT NULL,
	"window_end" text DEFAULT '21:00' NOT NULL,
	"hashtags" text DEFAULT '' NOT NULL,
	"caption_template" text DEFAULT '{{title}} at {{company}} in {{location}}. {{link}}' NOT NULL,
	"pause_all" boolean DEFAULT false NOT NULL,
	"facebook_token_error" text,
	"instagram_token_error" text,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_digests" (
	"digest_date" date PRIMARY KEY NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "social_promotion_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_settings" ADD CONSTRAINT "social_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_digests" ADD CONSTRAINT "whatsapp_digests_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_posts_job_platform_key" ON "social_posts" USING btree ("job_id","platform");--> statement-breakpoint
CREATE INDEX "social_posts_status_next_idx" ON "social_posts" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "social_posts_platform_published_idx" ON "social_posts" USING btree ("platform","published_at");