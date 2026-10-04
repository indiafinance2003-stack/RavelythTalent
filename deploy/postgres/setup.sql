-- =============================================================================
-- Ravelyth Talent - PostgreSQL bootstrap
-- Run as the postgres superuser ONCE:
--
--   sudo -u postgres psql -f deploy/postgres/setup.sql
--
-- CHANGE the password below (or pass it in via psql variable) before running.
-- It must match the PASSWORD in DATABASE_URL / /var/www/ravelyth/.env.
-- =============================================================================

-- Role used by the application. LOGIN only, no superuser, no createdb.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ravelyth_app') THEN
        CREATE ROLE ravelyth_app WITH
            LOGIN
            PASSWORD ''CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD''
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT;
    END IF;
END
$$;

-- Database owned by that role.
SELECT 'CREATE DATABASE ravelyth OWNER ravelyth_app ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'ravelyth')
\gexec

-- Extensions required by the committed migrations.
\connect ravelyth
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Least privilege: the app only ever talks to its own database.
REVOKE ALL ON DATABASE ravelyth FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE ravelyth TO ravelyth_app;
GRANT USAGE, CREATE ON SCHEMA public TO ravelyth_app;

-- Managed backups create their own objects; grant a useful baseline.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ravelyth_app;

-- Sanity check.
SELECT current_database(), current_user;
