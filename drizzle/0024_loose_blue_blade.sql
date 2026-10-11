ALTER TABLE "outreach_campaigns" ADD COLUMN "follows_up_previous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "min_days_since_last_contact" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outreach_campaigns_archived_idx" ON "outreach_campaigns" USING btree ("archived_at");