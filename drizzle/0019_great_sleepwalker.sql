ALTER TABLE "assistant_settings" ADD COLUMN "sending_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD COLUMN "digest_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_settings" ADD COLUMN "digest_email" text;