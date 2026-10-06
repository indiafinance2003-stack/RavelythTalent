ALTER TABLE "users" ADD COLUMN "job_alert_email_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_alert_last_email_at" timestamp with time zone;