ALTER TABLE "orders" ADD COLUMN "billing_period" text;
-- ==========================================================================
-- Resume Builder templates.
--
-- The `resume_templates` table shipped in 0008 but was never populated, so the
-- Resume Builder's template picker rendered an empty list and the
-- `professional_resume_templates` entitlement had nothing it could gate. These
-- rows are the catalogue the builder reads.
--
-- `is_premium` IS LOAD-BEARING: `createResume` refuses a premium template unless
-- the candidate holds the `professional_resume_templates` entitlement, so these
-- flags are what makes the paid tier real rather than decorative. The free
-- templates below are deliberately included so a candidate who has never paid
-- still has something to choose from.
--
-- This is a DATA-only insert: no schema changes, so the migration snapshot for
-- this entry is unaffected. `ON CONFLICT DO NOTHING` keeps it safe to re-run and
-- safe on a database an operator has already customised.
INSERT INTO "resume_templates" ("code", "name", "description", "is_premium", "is_active") VALUES
  ('classic', 'Classic', 'A single-column layout with clear section headings. Suitable for most roles.', false, true),
  ('compact', 'Compact', 'A dense single-page layout that fits more experience onto one page.', false, true),
  ('modern', 'Modern', 'A two-column layout with a coloured sidebar for contact details and skills.', true, true),
  ('executive', 'Executive', 'A spacious layout designed for senior and leadership roles.', true, true),
  ('technical', 'Technical', 'A layout that foregrounds projects, technologies and engineering projects.', true, true)
ON CONFLICT ("code") DO NOTHING;