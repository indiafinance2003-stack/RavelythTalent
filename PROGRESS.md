# Ravelyth Talent — Build Progress

Living checklist. Updated after every phase so work can resume with limited context.

Stack: Next.js 16 (App Router) · React 19 · TypeScript (strict) · PostgreSQL + Drizzle ORM ·
Tailwind CSS v4 · zod · nodemailer · Razorpay · @react-pdf/renderer.

Domain `ravelyth.in` · App dir `/var/www/ravelyth` · Port 3000.

Legend: `[x]` done · `[~]` partially done / needs owner input · `[ ]` not started.

---

## Phase 1 — Scaffold, brand tokens, schema, seeds, env validation
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

## Phase 2 — Auth, sessions, rate limiting, email outbox
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

## Phase 3 — Companies, jobs, search, applications, candidate profile
- [ ] Recruiter company registration → admin approval workflow + emails
- [ ] Job create/edit/preview/submit, moderation queue, approve/reject
- [ ] Public home, job search (FTS + trigram), job detail
- [ ] Candidate profile (education, experience, skills, preferences, completeness)
- [ ] Resume upload (magic-byte verified, local disk, authenticated download)
- [ ] Apply (Easy Apply), duplicate guard, saved jobs, application tracker
- [ ] Recruiter applicant pipeline, bulk actions, private notes, status emails
- [ ] Company profile + verification docs + public company page

## Phase 4 — Plans, Razorpay, subscriptions, entitlements, invoices
- [ ] Plans + plan_features + promotions (candidate launch offer ₹1,999/yr)
- [ ] Pricing page (candidate/employer tabs, monthly/yearly toggle, savings)
- [ ] Razorpay Orders create → checkout → verify signature
- [ ] Webhook `/api/webhooks/razorpay` (raw body, idempotent)
- [ ] Subscriptions period model, renewal, reminders + expiry job
- [ ] Central `requireEntitlement()` / quota helper
- [ ] Invoices (PDF, sequence, GST from settings) + email
- [ ] Add-ons CRUD + purchase flow
- [ ] All payment / subscription / quota emails

## Phase 5 — Admin panel, interviews, notifications, alerts, cron, reports
- [ ] Admin dashboard KPIs
- [ ] Users, companies, job moderation, categories, plans, promotions
- [ ] Subscriptions, payments, invoices, add-ons, site settings, email log
- [ ] Blog posts, review moderation, priority support, audit log
- [ ] Interviews (schedule, email, candidate confirm)
- [ ] Notifications centre (in-app + email)
- [ ] Job alerts (saved searches, daily/weekly, unsubscribe)
- [ ] Cron endpoints `/api/internal/cron/*`
- [ ] Resume database / candidate search (Professional+)
- [ ] Reports: views, applications, conversion, source, time-to-hire

## Phase 6 — Resume builder, blog, reviews, salary insights
- [ ] Paid Resume Builder (templates, versions, PDF, history)
- [ ] Blog (public list/detail + admin CRUD)
- [ ] Company reviews (submit, moderate, company page)
- [ ] Salary insights (aggregates, threshold-gated)
- [ ] Recruiter↔candidate chat: intentionally NOT built (documented placeholder)

## Phase 7 — SEO, legal, deployment, final QA
- [ ] sitemap.xml, robots.txt, per-page metadata, OG, JobPosting JSON-LD
- [ ] Legal pages + admin-only draft notice
- [ ] About, Contact, FAQ, 404, error pages
- [ ] `/deploy`: nginx, systemd + cron timers, deploy.sh, postgres/setup.sql
- [ ] `DEPLOYMENT.md` runbook
- [ ] `.env.example` complete
- [ ] Final: typecheck / lint / build green

---

## Notes / decisions
See `ASSUMPTIONS.md` for every decision taken while working autonomously.

