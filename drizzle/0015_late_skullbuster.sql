CREATE TABLE "lead_email_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD COLUMN "lead_email_draft_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_classifications" ADD COLUMN "suggested_status" text;--> statement-breakpoint
ALTER TABLE "lead_email_drafts" ADD CONSTRAINT "lead_email_drafts_lead_id_company_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."company_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_email_drafts" ADD CONSTRAINT "lead_email_drafts_account_id_inbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."inbox_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_email_drafts" ADD CONSTRAINT "lead_email_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_email_drafts_lead_idx" ON "lead_email_drafts" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_email_drafts_status_idx" ON "lead_email_drafts" USING btree ("status");--> statement-breakpoint
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_lead_email_draft_id_lead_email_drafts_id_fk" FOREIGN KEY ("lead_email_draft_id") REFERENCES "public"."lead_email_drafts"("id") ON DELETE set null ON UPDATE no action;