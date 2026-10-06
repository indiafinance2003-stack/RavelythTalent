ALTER TABLE "companies" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "website_domain" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "normalized_contact_phone" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "free_job_posts_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "free_job_posts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "companies_normalized_name_idx" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "companies_website_domain_idx" ON "companies" USING btree ("website_domain");--> statement-breakpoint
CREATE INDEX "companies_normalized_phone_idx" ON "companies" USING btree ("normalized_contact_phone");--> statement-breakpoint
UPDATE "companies"
SET
  "normalized_name" = regexp_replace(lower("name"), '[^a-z0-9]', '', 'g'),
  "website_domain" = CASE
    WHEN "website" IS NULL OR btrim("website") = '' THEN NULL
    ELSE lower(regexp_replace(regexp_replace(split_part(regexp_replace(btrim("website"), '^https?://', '', 'i'), '/', 1), '^www\.', '', 'i'), ':[0-9]+$', ''))
  END,
  "normalized_contact_phone" = NULLIF(regexp_replace(coalesce("contact_phone", ''), '[^0-9]', '', 'g'), '')
WHERE "normalized_name" IS NULL
  OR "website_domain" IS NULL
  OR "normalized_contact_phone" IS NULL;