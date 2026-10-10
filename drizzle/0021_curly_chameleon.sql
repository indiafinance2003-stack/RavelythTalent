CREATE TYPE "public"."stipend_type" AS ENUM('paid', 'unpaid', 'performance_based');--> statement-breakpoint
ALTER TYPE "public"."payment_purpose" ADD VALUE 'internship_post';--> statement-breakpoint
ALTER TABLE "site_settings" ALTER COLUMN "free_job_posts" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "free_internship_posts_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "internship_post_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stipend_type" "stipend_type";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stipend_min_paise" bigint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stipend_max_paise" bigint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "duration_months" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "eligibility" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ppo_possible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "certificate_provided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "free_internship_posts" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "internship_post_price_paise" integer DEFAULT 39900 NOT NULL;