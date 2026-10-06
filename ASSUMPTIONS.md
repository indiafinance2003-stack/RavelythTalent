# ASSUMPTIONS.md

Every decision taken while building Ravelyth Talent autonomously, with the
reasoning. Anything marked **[OWNER ACTION]** needs a human.

Last updated: Phase 7.

---

## 1. Framework & tooling versions

| Choice | Version | Why |
| --- | --- | --- |
| Next.js | 16.3.8 (latest stable) | Mandated "latest stable". App Router, Route Handlers + Server Actions only. |
| React | 19.3.0 | Required by Next 16. |
| TypeScript | 5.9.3 | "latest stable" was 7.0.2 (the new Go compiler). Pinned to the mature 5.x line to avoid toolchain churn; `strict: true` is on. |
| Tailwind CSS | 4.3.3 | Latest stable. CSS-first `@theme` tokens (no `tailwind.config.js`). |
| Drizzle ORM / drizzle-kit | 0.45.3 / 0.31.11 | Mandated ORM. |
| zod | 4.6.5 | Mandated validation library. |
| Node | `engines: { "node": ">=20" }` only | No pinning, no `.nvmrc`, per instructions. |

### 1.1 `next lint` was removed in Next 16
`npm run lint` runs `eslint .` against a flat `eslint.config.mjs` that spreads
`eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
ESLint is pinned to 9.x because `eslint-config-next` 16 still depends on
`eslint-plugin-react` / `eslint-plugin-jsx-a11y`, whose peer ranges stop at
ESLint 9.

### 1.2 `arctic` was dropped
`arctic@3.7.0` is published as **deprecated** ("no longer supported"). The
brief allows "the arctic library **or equivalent**", so Google OAuth 2.0 is
implemented directly against Google's endpoints with PKCE (S256) + state using
`node:crypto` and `fetch`. No third-party OAuth dependency.

### 1.3 Middleware -> proxy
Next 16 renamed `middleware.ts` to `proxy.ts`. We deliberately do **not** use
edge middleware at all:
- Security headers (CSP, X-Frame-Options, Referrer-Policy, HSTS,
  Permissions-Policy, COOP, nosniff) are declared in `next.config.ts`
  `headers()`.
- CSRF Origin/Host verification happens in a shared server helper that every
  mutating Route Handler / Server Action calls, which is strictly stronger than
  a middleware check because it cannot be bypassed by a matcher mistake.

### 1.4 CSP is pragmatic
`script-src` includes `'unsafe-inline'` because Next.js injects inline bootstrap
scripts and Razorpay Checkout requires its own origins. `'unsafe-eval'` is added
in development only. `frame-ancestors 'none'`, `object-src 'none'` and
`base-uri 'self'` are enforced. A nonce-based CSP is noted as a future
improvement.

### 1.5 Output mode
`output: "standalone"` is **not** used. Plain `next start` under systemd is
simpler and is what `deploy/systemd/ravelyth.service` runs.

---

## 2. Database

### 2.1 Connectivity
`DATABASE_URL=postgresql://ravelyth_app:PASSWORD@127.0.0.1:5432/ravelyth` as
specified. Driver: `pg` (node-postgres) + `drizzle-orm/node-postgres`.

### 2.2 Lazy connections
Both the zod environment validation (`src/lib/env.ts`) and the connection pool
(`src/lib/db/index.ts`) are **lazy**. Reason: `next build` imports every route
module to collect metadata; if env parsing or pool creation ran at import time,
a build machine without `.env` or a reachable database would fail. Strict
validation runs at real server start via `src/instrumentation.ts`
(`assertEnv()`), which skips throwing during the build phase.

### 2.3 No database needed at build time
Every page that reads from PostgreSQL is dynamic (`export const dynamic =
"force-dynamic"` in the route-group layouts). Nothing is prerendered from live
data, so `npm run build` succeeds without a database. `npm run db:migrate` must
be run before `npm run build` on the server (the deploy script does this).

### 2.4 Primary keys
- Entity tables (users, companies, jobs, applications, ...) use `uuid` with
  `gen_random_uuid()` (built into PostgreSQL 13+, no pgcrypto needed). This
  prevents ID enumeration on public URLs.
- High-volume append-only tables (`email_outbox`, `audit_logs`, `rate_limits`,
  `webhook_events`) use `bigserial` for index locality.
- Ledger-like tables (`payments`, `invoices`) use `uuid` plus a human-readable
  `invoice_number`.

### 2.5 Full-text search & fuzzy matching live in a hand-written migration
`jobs.search_vector` and `candidate_profiles.search_vector` are `tsvector`
`GENERATED ALWAYS AS (...) STORED` columns, and the trigram GIN indexes live in
`drizzle/0001_search_extensions_and_sequences.sql` rather than the TypeScript
schema. Reason: Drizzle's `customType` + `generatedAlwaysAs` combination is
fragile and generated columns need raw SQL anyway. Those columns are queried
through `sql` fragments in the query layer. Migration 0001 also creates
`pg_trgm`, `unaccent` and the `invoice_number_seq` sequence.

### 2.6 Timestamps
All timestamps are `timestamptz`. Application code stores UTC and formats with
`Intl` for `en-IN`.

### 2.7 Money
All money is stored as an integer number of **paise** (`bigint` in PostgreSQL,
`number` in TypeScript) exactly as the brief requires. `numeric` is used only
where a fraction is meaningful (GST rate, years of experience, ratings).

### 2.8 Soft deletes
`users`, `companies`, `jobs`, `resumes` and `built_resumes` carry `deleted_at`.
Hard cascades are used for dependent rows with no standalone meaning (sessions,
tokens, skill links, application history).

---

## 3. Authentication & sessions

- **Password hashing**: argon2id (`@node-rs/argon2`, m=19456 KiB, t=2, p=1) with
  an automatic **bcryptjs** (cost 12) fallback if the native binding fails to
  load. Hashes are self-describing, so both algorithms can coexist; the login
  path detects the prefix and `needsRehash()` flags upgrades.
- **Sessions**: a 32-byte random opaque token in an `httpOnly`, `Secure`,
  `SameSite=Lax` cookie. Only the SHA-256 hash of the token is stored in
  `sessions`. The token is rotated on every login; `token_hash` is unique.
  - Cookie name: `ravelyth_session`.
  - Lifetime: 30 days rolling, `last_used_at` refreshed on each request.
  - `Secure` is omitted on plain-HTTP localhost so development works.
- **"Log out of all devices"**: revokes every session row for the user
  (`revoked_at`) - rows are kept for auditability rather than deleted.
- **Email verification**: `email_verification_tokens`, 256-bit token, 24h
  expiry, single use, hash stored. Unverified accounts cannot log in. Resending
  is rate limited.
- **Password reset**: `password_reset_tokens`, single use, 1 hour expiry; using
  one revokes all other sessions and sends a "password changed" email.
- **OTP**: 6 digits, SHA-256 hashed at rest, 5 minute expiry, max 5 attempts,
  60 second resend cooldown, rate limited per phone and per IP.
- **Google OAuth**: `oauth_accounts` keyed by `(provider, provider_account_id)`.
  A Google-verified email counts as verified and an existing account with the
  same email is **linked** instead of duplicated.
- **Account lockout**: 10 consecutive failed logins locks the account for 15
  minutes; the counter resets on success.
- **Rate limiting**: fixed-window counters in the `rate_limits` table keyed by
  `bucket_key` (for example `login:ip:1.2.3.4`). Limits are declared in one
  place (`src/lib/rate-limit.ts`) and documented in code comments. A DB-backed
  limiter was chosen over in-memory so it survives restarts and works across
  multiple worker processes.
- **CSRF**: every mutating Route Handler and Server Action calls
  `assertSameOrigin()`, which compares the `Origin` header's host against the
  `Host` header and `APP_URL`. Combined with `SameSite=Lax` cookies. Mutating
  JSON/AJAX requests without an `Origin` header are rejected.

---

## 4. Email

- `nodemailer` with STARTTLS enforced (`requireTLS: true` when
  `SMTP_SECURE=false`) on port 587, per the supplied settings.
- Every email is written to `email_outbox` (`queued` -> `sent`/`failed`) **before**
  any network call, so a user request never fails because SMTP is down.
- Retry uses exponential backoff: `2^attempts * 60` seconds capped at 6 hours,
  max 6 attempts, then status `failed` and visible in `/admin/emails` with a
  manual retry action.
- Templates are built from a single shared layout (navy/blue/teal) with a
  plain-text alternative generated alongside the HTML.
- Email headers use the absolute `APP_URL/logo.png` URL and the configured
  brand name as the image alt text, rather than relying on SVG support or a
  local-file existence check.
- Header/footer contact details come from `site_settings` and render as nothing
  when empty.
- **Test email**: an admin-only action sends a real message through the same
  outbox path so deliverability can be verified end to end.

---

## 5. Moderation

- Company verification and job publishing decisions are restricted to
  server-verified admins, recorded in `audit_logs`, and emailed through the
  existing outbox. Rejected items require a reason; verification files are
  only downloadable by an admin or an active company member.
- Newly approved job postings expire after 30 days. This uses the existing
  `expires_at` lifecycle and hourly expiry task; recruiters can repost later.

## 6. Payments & subscriptions

- **Razorpay Orders API only** (not the Subscriptions API), per the brief.
- All currency handling is in paise; currency is fixed to `INR` (from settings).
- **Webhook** `/api/webhooks/razorpay` verifies `X-Razorpay-Signature` against
  the **raw** request body using `RAZORPAY_WEBHOOK_SECRET`, then inserts into
  `webhook_events` with a unique `(provider, event_id)` index. A duplicate
  insert short-circuits, making the handler idempotent - a payment can never
  activate twice and a closed browser cannot lose one.
- Handled events: `payment.captured`, `payment.failed`, `order.paid`.
- **Upgrade / downgrade rule (chosen and authoritative)**: the new plan starts
  **immediately** and the unused remainder of the old period is **not refunded
  and not prorated**. The previous subscription is marked `cancelled` at the
  moment the new one activates. This is surfaced in the pricing FAQ copy.
- **Renewal**: there is no auto-debit. A subscription nearing expiry produces
  reminder emails (7 days, 1 day) and the user pays a fresh order. `auto_renew`
  is stored for a possible future mandate-based implementation.
- **Subscriptions are period-based**: a successful payment activates the plan
  for 1 month or 1 year and dispatches the activated / renewed email.
- **Invoice numbering**: `RAV/<financial-year>/<6 digits>` using
  `invoice_number_seq` created in migration 0001. Invoices are rendered to PDF
  server-side with `@react-pdf/renderer` (explicitly not Puppeteer), stored on
  local disk and emailed to the payer.
- **GST**: `gst_rate` and `gstin` come from `site_settings` and default to `0`
  and empty. No GST rate is invented. When `gst_rate` is 0 the invoice renders a
  "tax not applicable" line. **[OWNER ACTION]** set the real GSTIN and rate.
- **Add-ons** are seeded **inactive with `price_paise = NULL`** and cannot be
  purchased until an admin sets a price and activates them.
- Active add-ons are purchased as one-time Razorpay orders. Purchases retain a
  configured duration, are idempotent per payment, and receive their own
  numbered invoice. Per-job add-ons are limited to published jobs owned by the
  approved company. No add-on price or active offering is seeded.
- The checkout uses an active promotion's stored paise price only after the
  server validates its plan, billing period, active flag, and date window.

## 7. Admin, recruiter tools & candidate discovery

- Admin plan, promotion, category, site-setting, and add-on management is
  restricted to authenticated admins; monetary values are entered and stored
  in paise, and plan feature flags remain the source of entitlement checks.
- Candidate discovery is opt-in: only discoverable profiles are searchable.
  Resume-database access requires an approved company and an active plan with
  the corresponding entitlement. Monthly usage is counted per recruiter user
  in audit logs and limited by `site_settings.resumeDbViewLimit`. Resume
  downloads attached to a job application continue to use the separate
  application/company authorization path.
- Team invitations use 32-byte random tokens; only SHA-256 hashes are stored.
  They expire after seven days, and acceptance requires a verified recruiter
  account whose email matches the invitation. Team changes require the plan's
  team-management entitlement and are audited.
- Interview scheduling is scoped to applications belonging to the active
  company. Reschedules update the interview record and notify the candidate;
  candidate confirmation is restricted to the application owner.
- Recruiter analytics report application source (not job-view source), since
  the source field is captured on applications. Time-to-hire is derived from
  the application timeline and only includes hired applications with usable
  timestamps.

## 8. Resume Builder, blog, reviews & salary insights

- Free candidates may edit one Classic resume as a visual preview, but cannot
  download a PDF or use professional templates. Paid-builder, template, and
  version entitlements are checked on the server. Paid edits generate a PDF
  snapshot; finite version limits retain the newest versions and remove older
  PDF files. Generated PDFs stay outside `/public` and are served only through
  an owner-checked route.
- Blog article content is plain text with paragraph breaks rather than
  user-authored HTML, avoiding unsafe HTML rendering. Optional cover images are
  limited to validated JPEG, PNG, or WebP files and stored outside `/public`;
  only published posts and their covers are public. The `featureBlog` setting
  gates public blog routes.
- A candidate may submit one review per approved company. Reviews remain
  pending until an admin publishes them; public company pages show only
  published reviews and do not expose reviewer identity. Company rating/count
  aggregates are recalculated when a review is moderated. `featureReviews`
  controls public review display and submission.
- Salary insights include only published, visible, INR job salary ranges.
  Pay periods are annualized using 1 year, 12 months, 260 working days, and
  2,080 working hours per year. Groups are split by title, category, location,
  and original pay period and require at least five postings before display.
  These are listing aggregates, not individual salary guidance.
- Recruiter↔candidate chat is intentionally not implemented in v1, as required
  by the specification.

## 9. Public information, legal pages & contact

- About and FAQ copy describes current platform capabilities only; no company
  milestones, customers, or performance claims are invented. Public company,
  blog, and salary pages expose only their intended approved/published/
  threshold-qualified data.
- Legal policy pages use plain-text admin overrides from `site_settings` when
  provided; otherwise they use India-aware policy text generated from the
  platform's current job-portal-only model and configured legal name, address,
  support/contact email and phone. Empty contact settings are omitted rather
  than replaced with placeholder values. Terms use `jurisdictionCity` when
  configured and otherwise refer to courts in India. The exact
  "Draft: to be reviewed by legal counsel" notice is visible to admins in
  `/admin/settings`, not to public visitors. **[OWNER ACTION]** complete legal
  details and have counsel review/replace the starter text before launch.
- The public contact form is limited to five submissions per hour per
  requester IP, persists messages in `contact_messages`, and queues support
  email through `email_outbox`. Admins can mark those messages handled in
  `/admin/support`. A working support email must be configured in site settings
  or `SUPPORT_EMAIL`.
- A live manual walkthrough was not performed because the runtime database and
  external service credentials are not configured in this workspace. Use the
  post-deploy smoke-test checklist after owner setup.

## 10. Free employer job post

- Each company starts with the admin-configurable `site_settings.freeJobPosts`
  lifetime credit (default 1). Submitted free postings consume credits
  independently from monthly paid-plan quotas; rejected, closed, and deleted
  postings do not restore them. Automatic safety blocks are the sole exception
  and restore the credit before it is committed.
- Companies are deduplicated on a normalized name, website domain, and contact
  phone. Recruiter registration rejects domains listed in the maintained
  `src/lib/auth/disposable-email-domains.txt` denylist and has a separate
  three-per-hour-per-IP registration limit.

## 11. Moderation automation and reports

- New company accounts default to automatic approval after owner email
  verification; new jobs that score below 35 on the safety scan publish
  immediately. Scan scores 35-69 are held for review, scores of 70+ or
  hard-block rules are rejected. Admin settings can restore manual approval.
- A published job is automatically paused after reports from three distinct
  reporters; user reporters are deduplicated by account and anonymous reporters
  by a SHA-256 hash of the trusted requester IP.

## 12. Candidate premium

- Candidate Premium is derived from an unexpired active candidate subscription
  with the `resume_builder` entitlement enabled. The same server-side
  entitlement controls the resume builder and recruiter-visible badges; expiry
  removes those perks without client state.
- Recruiter candidate search ranks exact name/headline matches before partial
  matches, then uses Premium as the tie-breaker. Applicant lists also use
  Premium as the first ordering key and retain newest-application order within
  each tier.

## 13. Moderation and free-post settings

- `autoApproveCompanies` and `autoPublishJobs` default to `true`; either can be
  disabled in `/admin/settings` to return the corresponding step to manual
  review. Job safety holds and blocks remain in force regardless.
- `freeJobPosts` defaults to one lifetime post per company and is adjustable
  from `/admin/settings`; changing the value does not rewrite usage already
  recorded for a company. `jurisdictionCity` is optional and empty by default.

## 14. Candidate-to-employer conversion

- Employer conversion requires an active, email-verified candidate account and
  reuses the recruiter disposable-email and company-identity checks. The
  company is immediately approved only when `autoApproveCompanies` is enabled;
  otherwise it enters the existing pending review flow.
- Conversion preserves the candidate profile, resumes, applications and any
  candidate subscription. The profile's recruiter-search visibility is saved
  and disabled while the account has the recruiter role, then restored if the
  account switches back.
- The conversion free-post allowance is account-lifetime limited: a subsequent
  conversion initializes the new company with the configured free-post
  allowance already consumed. Existing companies remain in place when an
  owner switches back, preserving company-identity deduplication.
- Switching back is allowed only when the current company has no published or
  pending-approval jobs and no unexpired active employer subscription. The
  owner membership is removed, not deleted, and the company and hiring history
  remain intact.
