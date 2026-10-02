CREATE TABLE "company_client_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_company_id" uuid NOT NULL,
	"client_company_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_client_relationships_not_self_check" CHECK ("company_client_relationships"."agency_company_id" <> "company_client_relationships"."client_company_id")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "company_type" text DEFAULT 'employer' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "posted_for_company_id" uuid;--> statement-breakpoint
ALTER TABLE "company_client_relationships" ADD CONSTRAINT "company_client_relationships_agency_company_id_companies_id_fk" FOREIGN KEY ("agency_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_client_relationships" ADD CONSTRAINT "company_client_relationships_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_client_relationships" ADD CONSTRAINT "company_client_relationships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_client_relationships_agency_client_unique_idx" ON "company_client_relationships" USING btree ("agency_company_id","client_company_id");--> statement-breakpoint
CREATE INDEX "company_client_relationships_client_company_id_idx" ON "company_client_relationships" USING btree ("client_company_id");--> statement-breakpoint
CREATE INDEX "company_client_relationships_agency_status_idx" ON "company_client_relationships" USING btree ("agency_company_id","status");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_posted_for_company_id_companies_id_fk" FOREIGN KEY ("posted_for_company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_posted_for_company_id_idx" ON "jobs" USING btree ("posted_for_company_id");