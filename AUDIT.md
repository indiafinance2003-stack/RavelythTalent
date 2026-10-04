# Project audit

Audit performed against `MASTER_PROMPT.md` and the current repository state.
Phase status describes implementation evidence; it does not imply that
database-backed runtime behavior has been verified.

## Baseline commands

| Command | Result |
| --- | --- |
| `npm install` | Dependencies installed; no secrets or `.env` were created. |
| `npm run typecheck` | Passed on the final code. |
| `npm run lint` | Passed on the final code. |
| `npm run build` | Passed; optimized production build completed. |
| `npm run test` | Passed: 45 tests in 5 files. |
| `npm run test:e2e` | 2 smoke tests passed; DB health failed on local `ravelyth_app` authentication. |
| `npm run db:migrate` | Blocked because `DATABASE_URL` is unset; migrations and seeds have not run. |
| `npm audit --omit=dev --audit-level=low` | 0 production vulnerabilities. Full audit has 5 high findings in dev/lint tooling. |

## Phase status

| Phase | Status | Evidence and remaining work |
| --- | --- | --- |
| 1. Scaffold, brand, schema, migrations, seeds, env validation | DONE (implementation); runtime PARTIAL | `package.json`, `src/app/layout.tsx`, `src/components/brand/logo.tsx`, `src/lib/db/schema/`, `drizzle/`, `scripts/seed.ts`, `scripts/seed-admin.ts`, `scripts/seed-demo.ts`, `src/lib/env.ts`. `npm run db:generate` reports no schema changes. Database migrations and seeds are blocked because no verified `.env`/`DATABASE_URL` is available. |
| 2. Authentication, sessions, rate limits, email outbox | DONE (implementation); E2E PARTIAL | `src/lib/auth/`, `src/lib/rate-limit.ts`, `src/lib/email/`, `src/app/(auth)/`, and `src/app/api/auth/`. Crypto and template unit tests pass; DB-backed account and SMTP delivery journeys have not run. |
| 3. Company approval, job moderation, search and application pipeline | DONE (implementation); E2E PARTIAL | Recruiter company/job/application flows in `src/lib/recruiter/`, `src/app/(recruiter)/`, and `src/components/recruiter/`; moderation in `src/lib/admin/moderation.ts`; protected documents in `src/app/api/files/verification/[id]/route.ts`. PostgreSQL-backed workflows are unverified. |
| 4. Plans, payments, subscriptions, entitlements and invoices | DONE (implementation); E2E PARTIAL | `src/lib/billing/`, `src/lib/entitlements.ts`, `src/app/api/billing/`, `src/app/api/webhooks/razorpay/`, and billing pages. Focused billing unit tests pass; DB activation, webhook, invoice numbering, payment, and quota scenarios have not run. |
| 5. Admin panel, interviews, notifications, alerts, cron, candidate search and reports | DONE (implementation); E2E PARTIAL | Admin/recruiter routes in `src/app/(admin)/admin/` and `src/app/(recruiter)/recruiter/`; interviews, candidate search, reports, alerts and cron in their corresponding `src/lib/` modules and `src/app/api/internal/cron/`. Authorization and workflows need DB-backed tests. |
| 6. Resume builder, blog, reviews and salary insights | DONE (implementation); E2E PARTIAL | Resume Builder, blog, reviews, and salary insights in `src/app/` and `src/lib/` routes. Entitlements, moderation, feature flags, and salary thresholds have not been verified against a database. Recruiter↔candidate chat is intentionally not built, as recorded in `PROGRESS.md`. |
| 7. SEO, legal, public informational pages, deployment and final QA | PARTIAL | Sitemap/robots, public pages, legal templates, Nginx/systemd/deploy assets, `deploy/DEPLOYMENT.md`, and owner checklist exist. Typecheck/lint/build pass and robots smoke test passes. Live sitemap, working database health, provider flows, target-host config validation, and mobile/accessibility walkthrough remain unverified. |

## Audit notes

- `MASTER_PROMPT.md.txt` was renamed to `MASTER_PROMPT.md` as requested.
- The initial audit found missing moderation and add-on capabilities in Phases 3
  and 4; these were completed alongside Phase 5 plan/promotion administration.
- The DB health E2E test fails because the local app role cannot authenticate.
  A bootstrap attempt changed the local `postgres` password before failing;
  its generated password was not retained. `npm run db:migrate` then stopped
  before connection because no verified `DATABASE_URL` exists. No `.env` was
  created; migrations and seeds are not claimed as complete.
- The earlier missing `zod` import in
  `src/app/api/files/verification/[id]/route.ts` was fixed; final typecheck
  passes. Production-mode health errors were smoke-tested as generic JSON
  without SQL/stack detail, using intentionally invalid database credentials.
- A bounded static security review found one HIGH privilege issue in the
  root-run backup service; it now runs as the unprivileged `ravelyth` account.
  See `SECURITY_NOTES.md`.
- Full audit has five high findings in development/lint tooling; the suggested
  forced fix downgrades the Next.js lint configuration across a major version
  and was not applied. Production dependencies have zero reported findings.
