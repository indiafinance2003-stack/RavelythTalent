# Testing results

Environment: Windows, Node 24.19.0, npm 11.17.0. PostgreSQL 17 is installed
and its service is running on port 5432, but the app database is not usable.
The local PostgreSQL bootstrap changed the `postgres` password before failing;
the generated password was not retained. No project `.env`, app role, or
database migration has been verified. Mailpit is running locally at
`127.0.0.1:1025` (SMTP) and `127.0.0.1:8025` (web UI).

## Automated checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed; production Next.js build completed |
| `npm run test` | Passed: 45 tests across 5 Vitest files |
| `npm run test:e2e` | Partial: 2 public smoke tests passed; database health test failed because authentication for `ravelyth_app` fails |
| Production-mode smoke (`npm run start`) | Login returned 200; with deliberately invalid local DB credentials, `/api/health` returned generic 503 JSON without SQL, stack, or credential details |
| `npm run db:generate` | Passed earlier; Drizzle reported no schema changes |
| `npm run db:migrate` | Blocked before connecting: `DATABASE_URL is not set`; no `.env` was created |
| `npm audit --omit=dev --audit-level=low` | Passed: 0 production dependency vulnerabilities |
| `npm audit` | 5 high-severity findings remain in development/lint tooling; see `SECURITY_NOTES.md` |

The passing Playwright checks verify that the login page works without Google
OAuth and that robots rules disallow private areas. The health test intentionally
asserts that the database is available; it has not been weakened to hide the
local database blocker.

The production-mode response check used temporary process environment values
and an intentionally invalid database password; it did not verify production
operation against a working database.

## Not verified

No migrations or seeds completed; DB-backed user flows, SMTP delivery through the app,
production server startup, live sitemap contents, backup/restore, or end-to-end
payment and authorization scenarios could be verified without a working local
database. The requested full candidate, recruiter, admin, billing, cron,
subscription, resume builder, blog, review, and salary-insights test matrix is
not implemented yet. Nginx, systemd, and shell tooling are unavailable in the
Windows environment, so deployment files received no native syntax checks.

See `TESTING_PROGRESS.md` for the resume checklist and blocker details.
