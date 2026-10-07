ALTER TABLE "inbox_accounts" ALTER COLUMN "last_uid" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "inbox_messages" ALTER COLUMN "remote_uid" SET DATA TYPE bigint;