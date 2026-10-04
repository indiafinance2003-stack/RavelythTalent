-- Custom migration: PostgreSQL extensions, full-text search and sequences.
-- These objects are intentionally kept out of the Drizzle TS schema and are
-- referenced through raw SQL fragments in the application code.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ---------------------------------------------------------------------------
-- Job search: weighted tsvector + GIN + fuzzy trigram index on title
-- ---------------------------------------------------------------------------
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("responsibilities", '')), 'C') ||
    setweight(to_tsvector('english', coalesce("requirements", '')), 'C') ||
    setweight(
      to_tsvector('english', coalesce("city", '') || ' ' || coalesce("state", '')),
      'D'
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "jobs_search_vector_idx"
  ON "jobs" USING GIN ("search_vector");

CREATE INDEX IF NOT EXISTS "jobs_title_trgm_idx"
  ON "jobs" USING GIN ("title" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Company fuzzy matching
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "companies_name_trgm_idx"
  ON "companies" USING GIN ("name" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Candidate search (resume database, Professional+ plans)
-- ---------------------------------------------------------------------------
ALTER TABLE "candidate_profiles"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("headline", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("current_designation", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("summary", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("current_company", '')), 'C') ||
    setweight(to_tsvector('english', coalesce("current_location", '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "candidate_profiles_search_vector_idx"
  ON "candidate_profiles" USING GIN ("search_vector");

-- ---------------------------------------------------------------------------
-- Invoice number sequence (formatted as RAV/YYYY/000123 in application code)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START WITH 1 INCREMENT BY 1;
