-- Ravelyth Talent — Resume Builder storage and recruiter feature foundations.
--
-- 1. RESUME BUILDER CAN NOW EXIST WITHOUT AN UPLOADED FILE.
--    `resume_versions.storage_key` (and the filename/mime/size trio) become
--    nullable, and a new `source` column records how a version came into being.
--    Previously every version REQUIRED an uploaded document, which made
--    "compose a resume in the browser, then export a PDF" impossible — the
--    feature that was sold could not be used. A builder version is
--    `source = 'builder'` with `content_json` and no `storage_key`.
--
--    The unique index on `storage_key` becomes PARTIAL (`WHERE storage_key IS
--    NOT NULL`): two builder versions legitimately have no key, and no two
--    uploads may ever share one object.
--
--    This is a WIDENING migration, not a destructive one. Every pre-existing
--    row keeps its key, filename, MIME type and byte size, and the default for
--    `source` is 'upload' so historical versions stay correctly classified.
--
-- 2. THE BUILDER'S WORKING COPY LIVES ON THE RESUME.
--    `resumes.builder_content_json` holds the document a candidate is editing.
--    Keeping it here rather than only on a version is what makes "save, close
--    the tab, come back tomorrow" work without minting an immutable version on
--    every keystroke. An explicit "save version" still snapshots it.
--
-- 3. TEAM MANAGEMENT IS A REAL DATA MODEL.
--    `company_team_invitations` distinguishes pending / accepted / revoked /
--    expired, stores only a SHA-256 of the acceptance token (so a database read
--    can never mint a membership), and restricts the deleting user so the
--    record of who invited someone survives their departure. The partial
--    unique index at the end of this file stops one company sending the same
--    address two live invitations.
--    `company_team_events` is the team-scoped audit history an employer asks
--    about their own team, kept separate from the platform-wide `audit_log`.
--
-- 4. PRIORITY SUPPORT IS RECORDED, NOT ADVERTISED.
--    `support_ticket_priority_events` stores how a ticket's priority was
--    arrived at ('recruiter_plan' vs 'customer_request' vs 'agent') and every
--    later change, so a plan that includes `priority_support` produces a real
--    classification rather than a line of pricing copy.
--
-- 5. SEARCH INDEXES.
--    The recruiter resume database and advanced candidate search always filter
--    on (visibility, availability) first, so that pair is indexed together;
--    degree and language name are indexed for the education/language filters.
--
-- NOTE ON PROVENANCE: this file is `drizzle-kit generate` output, not
-- hand-written. The index
-- `company_team_invitations_company_pending_email_unique_idx` previously lived
-- only as a hand-appended line of SQL, which left it invisible to the snapshot:
-- `drizzle-kit generate` diffs the schema against the snapshot, so an index
-- declared in neither is never diffed, never dropped, and never regenerated if
-- it goes missing. It is now declared in `companyTeamInvitations` in
-- `src/lib/db/portal-schema.ts`, so the schema, this SQL and 0014_snapshot.json
-- all agree. Re-run `npm run db:generate` after any schema edit; if it reports
-- "No schema changes", schema and snapshot are consistent.
CREATE TABLE "company_team_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"member_user_id" uuid,
	"invitation_id" uuid,
	"actor_user_id" uuid,
	"from_value" text,
	"to_value" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"member_role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"job_title" text,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_team_invitations_role_check" CHECK ("company_team_invitations"."member_role" IN ('member', 'admin', 'owner'))
);
--> statement-breakpoint
CREATE TABLE "support_ticket_priority_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_priority" text,
	"to_priority" text NOT NULL,
	"source" text NOT NULL,
	"entitled_company_id" uuid,
	"actor_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "resume_versions_storage_key_unique_idx";--> statement-breakpoint
ALTER TABLE "resume_versions" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ALTER COLUMN "original_filename" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ALTER COLUMN "mime_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ALTER COLUMN "byte_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "pdf_byte_size" integer;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "pdf_checksum_sha256" text;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "builder_content_json" jsonb;--> statement-breakpoint
ALTER TABLE "company_team_events" ADD CONSTRAINT "company_team_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_team_events" ADD CONSTRAINT "company_team_events_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_team_events" ADD CONSTRAINT "company_team_events_invitation_id_company_team_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."company_team_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_team_events" ADD CONSTRAINT "company_team_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_team_invitations" ADD CONSTRAINT "company_team_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_team_invitations" ADD CONSTRAINT "company_team_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_team_invitations" ADD CONSTRAINT "company_team_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_priority_events" ADD CONSTRAINT "support_ticket_priority_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_priority_events" ADD CONSTRAINT "support_ticket_priority_events_entitled_company_id_companies_id_fk" FOREIGN KEY ("entitled_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_priority_events" ADD CONSTRAINT "support_ticket_priority_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_team_events_company_id_created_at_idx" ON "company_team_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "company_team_events_company_id_event_type_idx" ON "company_team_events" USING btree ("company_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "company_team_invitations_token_hash_unique_idx" ON "company_team_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "company_team_invitations_company_id_status_idx" ON "company_team_invitations" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "company_team_invitations_email_idx" ON "company_team_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "company_team_invitations_expires_at_idx" ON "company_team_invitations" USING btree ("expires_at");--> statement-breakpoint
-- One live invitation per address per company, declared on `companyTeamInvitations`
-- in portal-schema.ts (see that table's doc comment for why this is a partial
-- functional unique index). Scoped to 'pending' so a company can re-invite
-- somebody who previously declined or whose invitation expired, while two
-- clicks on "Invite" still cannot produce two live invitations. `lower(email)`
-- keeps casing from producing two "different" invitations for one person.
CREATE UNIQUE INDEX "company_team_invitations_company_pending_email_unique_idx" ON "company_team_invitations" USING btree ("company_id",lower("email")) WHERE "company_team_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "support_ticket_priority_events_ticket_id_created_at_idx" ON "support_ticket_priority_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_ticket_priority_events_to_priority_idx" ON "support_ticket_priority_events" USING btree ("to_priority");--> statement-breakpoint
CREATE INDEX "support_ticket_priority_events_entitled_company_id_idx" ON "support_ticket_priority_events" USING btree ("entitled_company_id");--> statement-breakpoint
CREATE INDEX "candidate_education_degree_idx" ON "candidate_education" USING btree ("degree");--> statement-breakpoint
CREATE INDEX "candidate_languages_name_idx" ON "candidate_languages" USING btree ("name");--> statement-breakpoint
CREATE INDEX "candidate_profiles_visibility_open_to_work_idx" ON "candidate_profiles" USING btree ("profile_visibility","open_to_work");--> statement-breakpoint
CREATE INDEX "candidate_profiles_visibility_location_idx" ON "candidate_profiles" USING btree ("profile_visibility","location");--> statement-breakpoint
CREATE INDEX "candidate_profiles_updated_at_idx" ON "candidate_profiles" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "employer_company_members_company_id_status_idx" ON "employer_company_members" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "resume_versions_source_idx" ON "resume_versions" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_storage_key_unique_idx" ON "resume_versions" USING btree ("storage_key") WHERE "resume_versions"."storage_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_source_check" CHECK ("resume_versions"."source" IN ('upload', 'builder'));