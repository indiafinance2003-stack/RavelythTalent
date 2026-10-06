ALTER TABLE "users" ADD COLUMN "employer_conversion_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "candidate_discoverable_before_employer" boolean;