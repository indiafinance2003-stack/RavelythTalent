# Ravelyth Talent — Build Progress

Living checklist. Updated after every phase so work can resume with limited context.

Stack: Next.js 16 (App Router) · React 19 · TypeScript (strict) · PostgreSQL + Drizzle ORM ·
Tailwind CSS v4 · zod · nodemailer · Razorpay · @react-pdf/renderer.

Domain `ravelyth.in` · App dir `/var/www/ravelyth` · Port 3000.

Legend: `[x]` done · `[~]` partially done / needs owner input · `[ ]` not started.

---

## Phase 1 — Scaffold, brand tokens, schema, seeds, env validation ✅
- [x] package.json / tsconfig / next.config.ts / postcss / eslint flat config (Next 16)
- [x] Tailwind v4 theme tokens (navy, royal, teal, sky tint, mint tint, off-white)
- [x] next/font: Plus Jakarta Sans (UI) + Caveat (script accent)
- [x] `<Logo />` component → `/public/logo.svg`, plain text wordmark fallback
- [x] Root layout, metadata, favicon → `/logo.svg`, skip link
- [x] Drizzle schema: enums/auth/candidate/company/jobs/billing/platform tables
- [x] Committed migration `drizzle/0000_*`
- [x] Custom migration `drizzle/0001_*` (pg_trgm, unaccent, tsvector + GIN, invoice sequence)
- [x] Lazy zod env validation (`src/lib/env.ts`) + `src/instrumentation.ts`
- [x] Lazy Drizzle client (`src/lib/db/index.ts`) + `src/lib/settings.ts`
- [x] `scripts/migrate.ts` (`npm run db:migrate`)
- [x] `scripts/seed.ts` (plans, entitlements, launch promotion, categories, skills, addons, site_settings)
- [x] `scripts/seed-admin.ts` (idempotent, pre-verified admin)
- [x] `scripts/seed-demo.ts` (refuses to run when NODE_ENV=production)
- [x] `/api/health` (DB connectivity probe)
- [x] Password hashing module (argon2id verified `$argon2id$`, bcryptjs fallback verified)
- [x] `npm run typecheck`, `npm run lint`, `npm run build` green
- [x] `ASSUMPTIONS.md`

## Phase 2 — Auth, sessions, rate limiting, email outbox ✅
- [x] Password hashing (argon2id, bcryptjs fallback)
- [x] Sessions in PostgreSQL, hashed opaque token, httpOnly/Secure/SameSite=Lax cookie
- [x] Register + email verification (24h token, resend with rate limit)
- [x] Login, logout, log out of all devices, account lockout
- [x] Password reset (single-use, 1h) + password-changed security email
- [x] Google OAuth 2.0 (PKCE + state) `/api/auth/google` + `/callback`
- [x] Mobile OTP abstraction (`SmsProvider`: console + msg91/twilio stubs)
- [x] DB-backed rate limiting helper + per-endpoint limits
- [x] CSRF (Origin/Host) guard + security headers
- [x] Email outbox, processor, retry with exponential backoff, SMTP transport
- [x] Branded HTML + text email templates
- [x] Auth UI: login, register, verify, forgot/reset password

## Phase 3 — Company approval, job moderation, search, applications ✅
- [x] Company registration/profile and verification-document submission
- [x] Admin company review queue: approve/reject with reason and email
- [x] Admin job moderation queue: approve/reject with notes and email
- [x] Role-protected verification-document downloads for admin and company members
- [x] Storage abstraction (local disk, buckets, magic-byte checks, path traversal guard)
- [x] Entitlements/quota helper (`requireEntitlement`, `listUserCompanies`, membership)
- [x] Job + company query layer (FTS + trigram search)
- [x] Home page, public job search, job detail (JSON-LD `JobPosting` + ApplyPanel)
- [x] Candidate dashboard: overview, applications, saved, resumes, alerts, profile, settings, notifications
- [x] Resume upload (magic-byte verified) + authenticated download (owner/company/admin)
- [x] Apply (Easy Apply), duplicate guard, withdraw, saved jobs
- [x] Job alerts (saved searches) + unsubscribe endpoint
- [x] Notifications centre (in-app) + notification emails
- [x] 5 cron endpoints `/api/internal/cron/*` + cron task library
- [x] `robots.txt` + `sitemap.ts`
- [x] Recruiter job submission and applicant status pipeline
- [x] Company and job moderation decisions audited in `audit_logs`

## Phase 4 — Plans, Razorpay, subscriptions, entitlements, invoices ✅
- [x] Plans + plan_features + promotions (candidate launch offer ₹1,999/yr) — seeded in Phase 1
- [x] Pricing page (`/pricing`: candidate/employer tabs, monthly/yearly toggle, promotion banner)
- [x] Razorpay Orders create `/api/billing/order` → Checkout → verify `/api/billing/verify` (HMAC signature)
- [x] Webhook `/api/webhooks/razorpay` (raw body HMAC, dedup via `webhook_events`, retry-safe)
- [x] Idempotent `activateSubscription()` (browser + webhook safe), period model, upgrade/downgrade rule
- [x] Renewal reminders + expiry job (`subscription-expiry-and-reminders` cron) — built in Phase 3
- [x] Invoices: PDF via `@react-pdf/renderer`, `RAV/<FY>/<seq>` numbering, GST from site settings
- [x] Billing emails: payment success, activated, invoice delivery (payment_success/subscription_activated/invoice)
- [x] Billing history pages: `/dashboard/billing` + `/recruiter/billing` (company-scoped via `?company=`)
- [x] Invoice PDF download `/api/files/invoices/[id]` (owner/company-member/admin only)
- [x] Add-ons admin configuration and purchase flow with company/job scope,
      idempotent activation, invoice and email delivery
- [x] Plan/promotion admin CRUD (completed in Phase 5)

## Phase 5 — Admin panel, interviews, search and reports ✅
- [x] Recruiter area: company setup, job posting with entitlement checks, applicant pipeline
  - [x] Company team invitations, acceptance, and member removal with plan gating
- [x] Admin dashboard and administration for users, companies, jobs, categories, plans,
      promotions, subscriptions/payments/invoices, add-ons, settings, email outbox,
      support, and audit logs
- [x] Interview scheduling/rescheduling, email and in-app notifications, candidate confirmation
- [x] Discoverable-candidate search and saved candidates, gated by plan entitlement;
      resume database downloads enforce monthly access limits
- [x] Reports for job views, applications, conversion, application source, and time-to-hire
- [x] Phase 5 validation: `npm run typecheck`, `npm run lint`, and `npm run build`

## Phase 6 — Resume builder, blog, reviews and salary insights ✅
- [x] Resume Builder: one basic free preview; paid templates, server-side plan gates,
      saved versions/history, generated PDFs, and owner-only downloads
- [x] Admin-managed blog drafts/publication, safe cover uploads, public listing/detail,
      SEO metadata, and feature flag
- [x] Candidate company reviews, admin moderation, published company-page reviews,
      and maintained company rating aggregates
- [x] Salary insights from published disclosed INR jobs, annualized by pay period,
      with a five-posting minimum per role/category/location group
- [ ] Recruiter↔candidate chat: intentionally NOT built (documented placeholder)

## Phase 7 — SEO, legal, final QA
- [x] sitemap.xml, robots.txt, per-page metadata, OG, JobPosting JSON-LD (jobs part done in Phase 3)
- [x] Privacy, terms, refund/cancellation templates use site settings; admin-only legal draft notice
- [x] About, Contact (rate-limited form, email outbox, admin inbox), FAQ, 404, error pages
- [x] `/deploy`: nginx, systemd + cron timers, deploy.sh, postgres/setup.sql
- [x] `DEPLOYMENT.md` runbook
- [x] `.env.example` complete (includes RAZORPAY_*)
- [x] Final `npm run typecheck`, `npm run lint`, `npm run build`
- [~] Live manual walkthrough requires configured PostgreSQL, SMTP, Google and Razorpay owner credentials

---

## Notes / decisions
See `ASSUMPTIONS.md` for every decision taken while working autonomously.

Implementation is complete. Automated quality checks are green. Before launch,
configure owner credentials and perform the database-backed and provider-backed
manual smoke tests listed in `DEPLOYMENT.md`.

## Post-phase runtime validation and launch hardening

- [x] Added focused Vitest and Playwright smoke-test commands; latest unit run:
      45 tests pass. Typecheck, lint, and production build pass.
- [x] Added payment/SMS provider-unavailable guards, audited offline
      subscription activation, robots/sitemap filters, admin first-run checks,
      internal cron Nginx denial, and rotating database backup assets.
- [x] Security review finding fixed: backup systemd service now runs as the
      unprivileged `ravelyth` account instead of root.
- [ ] Runtime database validation remains blocked. PostgreSQL service is
      running, but no verified app credentials or `.env` exist; `npm run
      db:migrate` stops because `DATABASE_URL` is not set. Migrations and seeds
      have not run. Mailpit is running locally on ports 1025/8025.
- [ ] Playwright DB health smoke check remains failing on app-role
      authentication; broader end-to-end, mobile/accessibility, external
      provider, and target-host deployment checks are outstanding.
- [ ] Five high npm audit findings remain in development/lint dependencies;
      production dependencies report zero. Details and recommendations are in
      `SECURITY_NOTES.md`.

Resume with `TESTING_PROGRESS.md`, which tracks the exact outstanding
verification and owner actions. Do not consider the application launch-ready
until the database and integration-test blockers are cleared.
