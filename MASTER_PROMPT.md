You are building "Ravelyth Talent" (domain: ravelyth.in), a production-grade Indian job portal comparable to Naukri and LinkedIn Jobs, as a single Next.js full-stack application backed by PostgreSQL. Work autonomously. Do not ask me questions; make sensible decisions, record them in ASSUMPTIONS.md, and keep going. The project folder is empty except for .git.

# 0. HARD RULES

STACK (mandatory, do not substitute):
- Next.js (latest stable) with the App Router, React, TypeScript (strict mode)
- Next.js Route Handlers and Server Actions for all backend logic. No separate backend, no Express.
- PostgreSQL with Drizzle ORM and drizzle-kit migrations (commit the generated migration files)
- Tailwind CSS for styling
- zod for all validation
- nodemailer for SMTP email
- Razorpay Node SDK for payments
- Do NOT use MongoDB, Firebase, Supabase, Prisma, or any other framework.
- Do not pin or change the Node.js version. Set "engines": {"node": ">=20"} only.

PROCESS RULES:
- Do NOT run git push, do not change git remotes, and do not deploy or SSH anywhere. I will push and deploy manually. Local commits after each phase are fine.
- Never commit secrets. Create .env.example with every variable and empty or safe placeholder values. Add .env* (except .env.example) to .gitignore.
- Do not fabricate data in production code. No fake companies, jobs, or users in normal seeds. Provide a separate script "npm run seed:demo" that refuses to run when NODE_ENV=production.
- Do not invent a company legal name, address, phone, or social links. All of these come from an admin-editable site_settings table, with placeholders shown until filled.
- LOGO: use only the approved logo at /public/logo.svg. Do NOT create or invent a logo, and do NOT use the default Next.js or Vercel icon or any globe icon. Build a single <Logo /> component that renders /public/logo.svg and, if the file is missing, falls back to a plain text wordmark "Ravelyth" (navy) and "Talent" (teal) in the brand font, with no symbol or icon. Point favicon and metadata icons to /logo.svg. I will supply the real file.
- Keep a PROGRESS.md checklist of the phases below and update it as you finish each one, so work can resume if context runs out.
- Before finishing, "npm run typecheck", "npm run lint" and "npm run build" must all pass. Fix every error.

# 1. BRAND AND UI

Brand: Ravelyth Talent. Tagline: "Connecting Great People with Great Opportunities". Sub-tagline: "Right People | Better Opportunities | Stronger Tomorrow". Pillars: Find Jobs, Hire Talent, Build Careers. Script accent line: "Your Next Opportunity Awaits".

Design tokens (approximate, from the brand reference; define as Tailwind theme colors / CSS variables):
- navy #0B2A6F (headings, primary text)
- royal blue #1F6FEB (primary buttons, links)
- teal #3DB8B0 (accents), with a teal-to-blue gradient for the word "Talent"
- sky tint #DCEBFB and mint tint #C8EEE7 (section backgrounds, decorative circles)
- off-white #FAFAF8 (page background)
- slate neutrals for body text and borders

Style: modern, clean, rounded (rounded-xl/2xl), soft shadows, generous spacing, light and airy. Use next/font: "Plus Jakarta Sans" for UI and "Caveat" for the script accent line. Fully responsive (mobile-first), accessible (labels, focus rings, contrast, keyboard navigation), with loading skeletons, empty states, and error states. Decorative soft circles in sky and mint like the brand banner. Do not use stock photos; use CSS shapes and lucide-react icons.

# 2. ROLES

- job_seeker (candidate), recruiter (employer; company owner or team member), admin.
- Server-side authorization on EVERY route handler and server action (role, ownership, plan entitlement). Never trust the client.

# 3. AUTHENTICATION (custom, server-side)

- Email + password registration with required email verification (tokenized link, expires 24h, resend with rate limit). Unverified users cannot log in.
- Password hashing with argon2id (@node-rs/argon2; fall back to bcryptjs if the native module fails to install).
- Sessions stored in PostgreSQL; random opaque token in an httpOnly, Secure, SameSite=Lax cookie; hash the token in the DB; rotate on login; logout and "log out of all devices".
- Google login via OAuth 2.0 (use the "arctic" library or equivalent; PKCE + state). Callback: /api/auth/google/callback. Google-verified emails count as verified. Link to the existing account if the email matches.
- Mobile OTP login/verification: 6-digit OTP, hashed in DB, 5-minute expiry, max 5 attempts, resend cooldown, rate limited. Implement an SmsProvider interface with a "console" provider for development and a clearly documented adapter stub for a real provider (MSG91/Twilio) selected via SMS_PROVIDER env var. Real SMS integration is left for me.
- Password reset flow (tokenized, single-use, 1 hour expiry), with an email notification on password change.
- Rate limiting (DB-backed or in-memory with documented limits) on login, register, OTP, reset, and resend endpoints. Zod validation everywhere. CSRF protection via Origin/Host checks on mutating requests plus SameSite cookies. Security headers (CSP, X-Frame-Options, Referrer-Policy, etc.) via next.config / middleware.
- Admin seeding: "npm run seed:admin" creates or updates the admin from ADMIN_NAME (default "Liky"), ADMIN_EMAIL, and ADMIN_PASSWORD in env. Admin is pre-verified. Idempotent.
- Recruiters register with company details and cannot post jobs or use paid features until an admin approves the company (status: pending, approved, rejected, suspended). Send emails on submission, approval, and rejection (with a reason).

# 4. DATABASE (Drizzle + PostgreSQL)

Connection from env: DATABASE_URL=postgresql://ravelyth_app:PASSWORD@127.0.0.1:5432/ravelyth.
Design a normalized schema with proper indexes, foreign keys, enums, and timestamps. At minimum:
users, sessions, oauth_accounts, email_verification_tokens, password_reset_tokens, otp_codes, candidate_profiles, education, work_experience, skills, candidate_skills, resumes (uploaded files), built_resumes (builder documents and versions), companies, company_members (team roles), company_verification_documents, categories, jobs, job_skills, applications, application_status_history, saved_jobs, saved_candidates, job_alerts, interviews, notifications, plans, plan_features/entitlements, subscriptions, payments, invoices, addons (configurable, see section 8), email_outbox (queue + log), audit_logs, site_settings, blog_posts, company_reviews, rate_limits.
- Jobs: statuses draft, pending_approval, approved/published, rejected, paused, closed, expired. Fields include title, slug, description, responsibilities, requirements, category, job type (Full-time, Part-time, Contract, Internship, Temporary, Freelance), work mode (Remote, Hybrid, On-site), location(s), salary min/max/currency (INR default)/hidden flag, experience min/max years, openings, skills, deadline, featured flag, moderation notes.
- Add PostgreSQL full-text search (tsvector + GIN index; pg_trgm for fuzzy title/company matching) for job search.
- Provide scripts: db:generate, db:migrate, db:studio, seed (plans, categories, site_settings defaults), seed:admin, seed:demo.
- Seed India-focused categories: IT & Software, Sales & Business Development, Marketing & Advertising, Finance & Accounting, Banking & Insurance, HR & Recruitment, Operations & Supply Chain, Customer Support & BPO, Healthcare & Pharma, Education & Training, Engineering & Manufacturing, Construction & Real Estate, Design & Creative, Legal & Compliance, Hospitality & Travel, Retail & E-commerce, Media & Content, Administration & Office, Logistics & Transport, Data Science & Analytics.

# 5. JOB SEEKER FEATURES

- Public home page, job search page, and job detail page that are SEO-friendly and server-rendered. Include a sitemap.xml, robots.txt, per-page metadata, Open Graph tags, and JobPosting JSON-LD on job pages.
- Search with keyword, location, category, job type, work mode, salary range, experience, date posted, and company; sorting (relevance/newest); pagination; and an "Easy Apply" experience.
- Candidate profile: personal details, headline, summary, education, work experience, skills, preferred locations/roles/salary, notice period, profile completeness meter, and a privacy toggle for whether recruiters on Professional+ plans can find them in the resume database.
- Resume upload to LOCAL DISK (PDF, DOC, DOCX; max 5 MB; verify extension, MIME and magic bytes; random filenames; stored in UPLOAD_DIR outside /public; served only through an authenticated route handler with ownership checks; path-traversal safe). Multiple resumes, with a default selectable.
- Apply to a job (resume selection, optional cover note), and prevent duplicates. Save/unsave jobs. Application tracker with status timeline. Notifications center (in-app + email). Interview invitations view.
- Job alerts: save a search with frequency (daily/weekly) and email matching new jobs. Unsubscribe link in every alert.
- Candidate plans: Free (Rs 0) and Paid (Rs 499/month or Rs 2,999/year). Launch offer: Rs 1,999/year (promotion record, configurable, activatable and deactivatable by admin). Paid plan unlocks the premium Resume Builder: professional templates, multiple resume versions, continued editing, PDF generation/download (use @react-pdf/renderer, not Puppeteer), and resume history. Free users get a limited preview/one basic template; gate the rest server-side.

# 6. RECRUITER / COMPANY FEATURES

- Company profile (logo upload, about, industry, size, website, locations), verification document upload, and public company page.
- Job posting form with draft, preview, and submit for approval. Jobs go live only after admin approval. The recruiter is notified of approval or rejection (with reason). Edit, pause, close, repost, and duplicate jobs.
- Monthly job-post quota enforced server-side per plan (count jobs submitted within the current billing period). Warn by email and in-app at 80% usage and when the limit is reached; block posting at the limit with an upgrade prompt.
- Applicant management: pipeline statuses (applied, viewed, shortlisted, interview, offered, hired, rejected), filtering, bulk actions, private notes, resume viewing/download, and status-change emails to candidates.
- Interview scheduling: date/time, mode (video/phone/in-person), location or link, notes; email notifications to the candidate; candidate confirmation.
- Plan entitlements (store in plan_features and enforce in a central server-side helper, e.g. requireEntitlement(companyId, feature)):
  - Basic: Rs 3,999/month or Rs 30,000/year; 5 job posts/month; core company, job, and application tools.
  - Professional: Rs 7,999/month or Rs 50,000/year; 15 job posts/month; everything in Basic + advanced candidate search, resume database, saved candidates, shortlisting, interview management, enhanced reports.
  - Business: Rs 12,999/month or Rs 70,000/year; 25 job posts/month; everything in Professional + team/recruiter management (invite members, roles, per-member activity) and advanced analytics.
  - Enterprise: Rs 35,999/month or Rs 1,15,000/year; 50 job posts/month; everything in Business + full enterprise recruitment operations, advanced analytics and team management, and priority support flag (priority support requests visible first to admin).
- Candidate search/resume database (Professional+): searches only candidates who opted in; filters; saved candidates; view limits are configurable.
- Reports: per-job views/applications/conversion, source, time-to-hire (enhanced for Professional+, advanced analytics for Business+).
- Recruiters without an active subscription can complete the company profile but cannot post jobs.

# 7. ADMIN PANEL (/admin, admin role only)

Dashboard with KPIs, plus management of: users (suspend/activate), companies (approve/reject/suspend with reason), job moderation queue (approve/reject with notes), categories, plans/prices/entitlements/promotions (all editable, prices stored in paise), subscriptions and payments, invoices, add-ons, site settings (contact email, phone, address, social links, legal company name, GSTIN, support details), email log/outbox with retry, blog posts, company review moderation, priority support requests, and an audit log of admin actions.

# 8. PAYMENTS (Razorpay) AND SUBSCRIPTIONS

- Use Razorpay Orders (not the Subscriptions API) for MVP. Store all amounts in paise. Subscriptions are period-based: a successful payment activates a plan for 1 month or 1 year. Renewal means a new order, with reminder emails before expiry and an expiry job.
- Flow: server creates the order, client opens Razorpay Checkout, server verifies the payment signature, and the webhook (/api/webhooks/razorpay) independently verifies the signature using the RAW request body and RAZORPAY_WEBHOOK_SECRET. Make it idempotent (dedupe on event id / payment id) so a payment can never activate twice or be lost if the browser closes. Handle payment.captured, payment.failed, and order.paid.
- Handle upgrade/downgrade clearly (document the proration rule you choose in ASSUMPTIONS.md; simplest: the new plan starts immediately and the remaining time is not refunded).
- Generate an invoice (PDF) for every successful payment with an invoice number sequence, plan, period, amount, and GST fields (GST rate and GSTIN configurable in settings; do not invent values). Store on local disk, make downloadable by the owner, and email it.
- Configurable add-ons: an "addons" table (e.g. Featured Job, Urgent Hiring badge, Job Boost) with name, description, type, price in paise (nullable), active flag (default inactive), and duration. Build the admin CRUD and purchase flow, but seed NO fixed prices and NO active add-ons.
- Razorpay keys: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID. Never expose the secret to the client.

# 9. EMAIL (SMTP)

nodemailer with env: SMTP_HOST=mail.ravelyth.in, SMTP_PORT=587, SMTP_SECURE=false with STARTTLS required (requireTLS), SMTP_USER, SMTP_PASS, EMAIL_FROM="Ravelyth Talent <noreply@ravelyth.in>".
Use an email_outbox table (queued, sent, failed, attempts, last_error) with retry and exponential backoff, and a processor. Never fail a user request because SMTP failed. Responsive, brand-styled HTML templates (navy/blue/teal) with a plain-text fallback, built with a shared layout. Templates required: email verification, verification resend, password reset, password-changed security notice, other security notifications (new login, OTP/security alerts), application submitted, application status change, interview notification, job alert, company verification (submitted/approved/rejected), job approved/rejected, application received (to recruiter), candidate shortlisted, payment success, payment failure, subscription activated, renewed, expiring-soon and expired, invoice delivery, and job-post limit warning and limit reached. Provide an admin-only "send test email" action.

# 10. BACKGROUND JOBS

No extra infrastructure. Create secured internal endpoints under /api/internal/cron/* protected by the CRON_SECRET header (constant-time compare, accept calls only from localhost): process-email-outbox (every minute), send-job-alerts (daily/weekly), subscription-expiry-and-reminders (hourly), expire-jobs (hourly), cleanup-expired-tokens-sessions (daily). Provide matching systemd .service/.timer unit files that call them with curl.

# 11. EXTRA FEATURES (build after the core is complete, behind feature flags in site_settings)

- Blog / career advice: admin-managed posts (title, slug, content, cover, category, published flag), public listing and detail pages with SEO metadata.
- Company reviews: signed-in candidates can submit a rating and review, moderated by admin before publishing, shown on the company page.
- Salary insights: simple aggregate pages computed from published job salary data (by title/category/location), shown only when there are enough records.
- Recruiter-candidate chat: NOT in v1. Do not build it. Leave a documented placeholder only.

# 12. PUBLIC PAGES

Home (hero with tagline, search bar, the three pillars, popular categories, featured jobs, top companies, how it works, pricing teaser, the "Your Next Opportunity Awaits" script accent), Jobs, Job detail, Companies, Company detail, Pricing (separate candidate and employer tabs with a monthly/yearly toggle and yearly savings shown), About, Contact (form that emails support), Blog, FAQ, Privacy Policy, Terms of Service, Refund/Cancellation Policy, 404 and error pages. Legal pages are sensible Indian-law-aware templates that pull the legal name, address, and email from site_settings and show a visible "Draft: to be reviewed by legal counsel" notice in admin only. Footer with contact details and social links from settings, hidden if empty.

# 13. DEPLOYMENT ARTIFACTS (create, do not execute)

Target: Ubuntu 24.04 VPS, app directory /var/www/ravelyth, port 3000, Nginx reverse proxy, systemd, HTTPS for ravelyth.in (Let's Encrypt / certbot).
Create a /deploy folder:
- nginx/ravelyth.in.conf (HTTP to HTTPS redirect, www to apex redirect, proxy to 127.0.0.1:3000, correct forwarded headers, gzip, client_max_body_size 10m, long cache for /_next/static, security headers)
- systemd/ravelyth.service (runs "npm run start" as a non-root user, EnvironmentFile=/var/www/ravelyth/.env, Restart=always, hardening options) plus the cron timer units from section 10
- scripts/deploy.sh (git pull, npm ci, npm run db:migrate, npm run build, systemctl restart ravelyth, with failure checks)
- postgres/setup.sql (create role ravelyth_app and database ravelyth, with PASSWORD as a placeholder)
- DEPLOYMENT.md: a step-by-step runbook (install packages, create DB, create .env from .env.example, create UPLOAD_DIR e.g. /var/lib/ravelyth/uploads with correct ownership, migrate, seed, seed:admin, build, enable services and timers, nginx, certbot, set up the Razorpay webhook URL https://ravelyth.in/api/webhooks/razorpay, set the Google OAuth redirect URL, verify email deliverability/SPF/DKIM, backups with pg_dump cron, and a post-deploy smoke-test checklist).
- .env.example with: NODE_ENV, APP_URL=https://ravelyth.in, DATABASE_URL, SESSION_SECRET, CRON_SECRET, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, UPLOAD_DIR, SMTP_*, EMAIL_FROM, RAZORPAY_*, NEXT_PUBLIC_RAZORPAY_KEY_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SMS_PROVIDER and its credentials.
- Use "output: standalone" ONLY if it does not complicate the systemd setup; otherwise use plain "next start".
- A /api/health endpoint that checks DB connectivity.

# 14. EXECUTION ORDER (update PROGRESS.md after each)

Phase 1: Scaffold, Tailwind and brand tokens, Logo component, layout, Drizzle schema and migrations, seeds, env validation (zod) at startup.
Phase 2: Auth (email/password, verification, reset, Google, OTP abstraction), sessions, rate limiting, roles, admin seed, email outbox and SMTP with core templates.
Phase 3: Company registration and admin approval, job posting with moderation, public job search and detail, candidate profile, resume upload, apply, saved jobs, application tracking, recruiter applicant management.
Phase 4: Plans, pricing page, Razorpay orders, verify, webhook, subscriptions, entitlements and quotas, invoices, and all payment/subscription/quota emails.
Phase 5: Admin panel completion, interviews, notifications, job alerts, cron endpoints and timers, resume database and candidate search, reports and analytics.
Phase 6: Candidate Resume Builder (paid) with PDF generation, then blog, reviews, and salary insights.
Phase 7: SEO, legal pages, deployment artifacts and DEPLOYMENT.md, then final quality pass: typecheck, lint, build, and a manual walkthrough of the main flows.

Prioritize a fully working core (Phases 1 to 4) over polish. If time is short, finish phases in order and never leave a half-built phase.

# 15. FINAL REPORT

When done, give me: (a) what is complete per phase, (b) anything not built, (c) the exact commands to run on the server, (d) every environment variable I must fill in, (e) the manual items left for me: real SMS provider adapter, Razorpay live keys and webhook setup, Google OAuth credentials, SMTP credentials, the logo file at public/logo.svg, legal details in admin settings, and (f) the contents of ASSUMPTIONS.md. Do not push to git.