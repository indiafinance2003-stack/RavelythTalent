# Project audit

Audit performed against `MASTER_PROMPT.md.txt` (the specification file present
in the repository root) and the current repository state.

## Baseline commands

| Command | Result |
| --- | --- |
| `npm install` | Succeeded; dependency audit reported 9 vulnerabilities (4 moderate, 5 high). |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run build` | Passed; no build errors. |

## Phase status

| Phase | Status | Evidence and remaining work |
| --- | --- | --- |
| 1. Scaffold, brand, schema, migrations, seeds, env validation | DONE | `package.json`, `src/app/layout.tsx`, `src/components/brand/logo.tsx`, `src/lib/db/schema/`, `drizzle/0000_magical_alex_wilder.sql`, `drizzle/0001_search_extensions_and_sequences.sql`, `scripts/seed.ts`, `src/lib/env.ts`. |
| 2. Authentication, sessions, rate limits, email outbox | DONE | `src/lib/auth/`, `src/lib/rate-limit.ts`, `src/lib/email/`, `src/app/(auth)/`, and `src/app/api/auth/`. |
| 3. Company approval, job moderation, search and application pipeline | DONE | Recruiter company setup/verification upload and job/application flows exist in `src/lib/recruiter/`, `src/app/(recruiter)/`, and `src/components/recruiter/`. Company/job review queues and audited decisions are now in `src/lib/admin/moderation.ts` and `src/app/(admin)/admin/`; protected document downloads are in `src/app/api/files/verification/[id]/route.ts`. Interview scheduling belongs to Phase 5 and remains absent. |
| 4. Plans, payments, subscriptions, entitlements and invoices | DONE | Plan catalog, Razorpay order/verify/webhook, subscription activation, quota helper, invoices, and billing pages exist in `src/lib/billing/`, `src/lib/entitlements.ts`, `src/app/api/billing/`, `src/app/api/webhooks/razorpay/`, and dashboard billing pages. Add-on configuration is in `/admin/add-ons`; company-scoped checkout, activation, PDF invoice and outbox email are in `src/app/(recruiter)/recruiter/add-ons/`, `src/lib/billing/addons.ts`, and billing routes. Promotion prices are now validated and applied server-side in `src/app/api/billing/order/route.ts`. Plan/promotion administration remains Phase 5 work. |
| 5. Admin panel, interviews, notifications, alerts, cron, candidate search and reports | DONE | Admin pages and actions cover dashboard, users, companies/jobs, categories, plans/promotions, billing, add-ons, settings, email outbox, support and audit logs in `src/app/(admin)/admin/` and `src/lib/admin/`. Interview scheduling/confirmation is in `src/lib/interviews/` and recruiter/candidate routes. Candidate search, saved candidates and download authorization are in `src/app/(recruiter)/recruiter/candidates/`, `src/lib/recruiter/candidate-actions.ts`, and `src/lib/candidate/downloads.ts`. Reports are in `src/lib/recruiter/reports.ts` and `/recruiter/reports`. Team management is in `src/lib/recruiter/team.ts` and `/recruiter/team`. Existing notifications, alerts and cron handlers remain in `src/lib/notifications.ts`, `src/lib/alerts/`, and `src/app/api/internal/cron/`. |
| 6. Resume builder, blog, reviews and salary insights | MISSING | Related schema foundations exist in `src/lib/db/schema/`, but the feature routes and UI are not implemented. |
| 7. SEO, legal, public informational pages, deployment and final QA | PARTIAL | Sitemap, robots, job metadata, error pages, nginx/systemd deployment assets and `DEPLOYMENT.md` exist in `src/app/`, `deploy/`, and the project root. About/contact/FAQ/legal pages are missing. Baseline QA passes. |

## Audit notes

- The repository contains `MASTER_PROMPT.md.txt`, not `MASTER_PROMPT.md`; that
  existing untracked specification was read in full and left untouched.
- `PROGRESS.md` previously marked Phases 3 and 4 complete despite the missing
  moderation and add-on capabilities listed above. Both core phases are now
  implemented; plan/promotion administration remains in Phase 5.
- Build/typecheck/lint reported no errors. `npm install` did report dependency
  audit findings; no forced dependency upgrades were attempted.
