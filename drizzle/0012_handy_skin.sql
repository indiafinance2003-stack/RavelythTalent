DROP INDEX "inbox_messages_account_uid_key";--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "remote_uid_validity" text;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_messages_account_uid_key" ON "inbox_messages" USING btree ("account_id","remote_uid_validity","remote_uid");