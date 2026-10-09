# RAVELYTH TALENT: BUILD ROUND 2 (outreach discovery, plan changes, internships, chat)

You are continuing "Ravelyth Talent", a LIVE Next.js (App Router, TypeScript) + PostgreSQL + Drizzle job portal at ravelyth.in. Earlier rounds are done and deployed (jobs, plans, Razorpay payments, Assistant inbox/leads/campaigns, social posting code, redesigned dashboards). Outreach assistant Phases 1 and 2 are also done in the repo (classifier fix, CSV history import, no_reply status, auto-approved follow-ups, migration 0017) but may not be deployed yet.

Read first: CLINE_PROMPT.md, CLINE_PROMPT_OUTREACH.md (if present, for extra detail; THIS file wins on conflicts), COMBINED_PROGRESS.md, KNOWN_ISSUES.md, ASSUMPTIONS.md, SECURITY_NOTES.md and the existing source under src/lib/assistant, src/lib/social, src/lib/jobs, src/lib/billing and src/lib/recruiter.

Do the tasks in this order: TASK A, TASK C, TASK B, TASK D, TASK E, then TASK F. Do NOT stop to ask me between tasks. Commit locally after each task. Stop only if you run low on context: then record exactly what is next in CLINE_PROGRESS_2.md and tell me to say "continue".

## 0. HARD RULES

- Same stack and libraries. Add a new dependency only if a task truly needs it and it is small and well known.
- NEVER run `git push`, change remotes, SSH or deploy. Local commits only.
- Never read, print, edit or create any `.env` file other than `.env.example`. No secrets in the repo.
- Never modify, reset or reinstall PostgreSQL on this machine. If no working local database exists, write mocked tests and record in KNOWN_ISSUES.md what was not exercised against a database.
- PRODUCTION SAFETY: every schema change is a NEW additive drizzle migration generated with db:generate. Never edit or delete existing migrations, never drop or rename existing columns or tables. Review each generated SQL file. Seeds stay idempotent (they re-run on the server).
- Do not touch public/logo.svg, public/logo.png, or the security headers in next.config.ts. You may ADD new files under deploy/systemd for new timers (ship them disabled).
- AI features stay OFF: do NOT add any new calls to the Anthropic API or any paid API. Rule-based logic only.
- Never scrape LinkedIn or any site that forbids crawling. Never auto-submit any website contact form. Never automate WhatsApp or phone calls. Never fabricate leads or contact data.
- Human approval stays on for first outreach emails. Keep unsubscribe and suppression behaviour exactly as is.
- Keep CLINE_PROGRESS_2.md as a checklist and update it after every sub-task.
- Before finishing: typecheck, lint, build and all tests pass.

## TASK A: TARGETS, WEBSITE CRAWLER AND CONTACT-FORM QUEUE

Goal: the portal finds business contact emails and contact forms on company websites by itself, and I review and approve them.

A1. Schema (additive migration):
- `company_targets`: id, company_name, website_url, domain (unique, lowercase), city, state, industry, source, status (new, crawling, crawled, emails_found, contact_form_only, no_contact_found, approved, rejected, converted), contact_form_url (nullable), crawl_error (nullable), pages_crawled int, last_crawled_at, created_at, updated_at.
- `target_emails`: id, target_id (cascade), email (lowercase), kind (hr, generic, other), source_url, mx_ok boolean, found_at; unique (target_id, email).
- `contact_form_queue`: id, target_id, company_name, form_url, prepared_message, status (pending, done, skipped), done_at, notes, created_at.

A2. Import and entry: /admin/assistant/targets with add form (company name and website), CSV import with preview (columns: Company Name, Website, City, State, Industry, Source; dedupe by domain), CSV export. A "create targets from leads without an email" action is optional.

A3. Crawler (src/lib/assistant/crawler/*), polite and safe:
- Fetch only http(s) on ports 80 and 443. SSRF protection: resolve DNS, reject private, loopback, link-local, multicast and metadata addresses (IPv4 and IPv6), re-validate on every redirect hop, max 3 redirects, 8 second timeout, max 1 MB per page, content-type must be text/html, max 6 pages per site: homepage plus /contact, /contact-us, /about, /about-us, /careers, /jobs if linked or present. Respect robots.txt (skip disallowed paths, and skip the whole site if it disallows everything). User-agent "RavelythTalentBot (+https://ravelyth.in/bot)". Delay at least 1 second between requests to the same host, concurrency 2 overall.
- Extract business emails from mailto: links and visible text. Ignore images, obfuscated tricks and anything outside the target's own domain unless it is clearly the company's own mail. Rank HR-type addresses first (hr@, careers@, jobs@, recruitment@, talent@, hiring@, people@), then others. Blocklist role addresses: dpo@, privacy@, legal@, abuse@, postmaster@, noreply@, no-reply@, security@, press@, webmaster@. Do an MX check (dns.resolveMx) and mark mx_ok. Skip emails already on the suppression list or already a lead.
- Contact-form detection: a `<form>` containing a message/textarea and an email or name field. Record its URL. NEVER submit any form.
- Statuses: emails_found if any usable email; contact_form_only if none but a form; no_contact_found otherwise; record crawl_error on failure.
- Cron endpoint /api/internal/cron/crawl-targets (CRON_SECRET, like the others) crawling at most 20 targets per run (setting `crawlPerRun`, default 20), plus an admin "Crawl selected now" button, plus disabled systemd service and timer files (every 30 minutes). Add `crawlEnabled` (default true) to assistant settings.

A4. Review UI (/admin/assistant/targets): filters by status, a detail panel showing found emails (with HR-type highlighted and MX status) and the form URL, actions: approve selected emails (creates one lead per email with status new, source "website", linking back), reject target, add a manual email, re-crawl. Contact-form-only targets can be sent to the queue.

A5. Contact-form queue (/admin/assistant/contact-forms): list of company, form URL (opens in a new tab with rel noopener), the prepared message built from a template with {{company}} placeholders (editable in assistant settings), a Copy button, and buttons "Mark done" and "Skip". Never auto-submit. Show counts.

A6. Tests: SSRF blocklist (private IPv4 and IPv6, redirects to private hosts), robots.txt handling, email extraction and ranking, blocklist roles, form detection, status decisions, dedupe against suppression and leads, CSV import validation, cron secret protection. Mock all network access.

## TASK C: PAUSE SWITCH, OUTREACH OVERVIEW AND DAILY SUMMARY EMAIL

C1. Global pause: add `sending_paused` boolean (default false) to assistant_settings. When true, process-campaigns and automatic replies send nothing (queued items remain), and a red banner shows on every /admin/assistant page with a one-click resume. Audit-log every change.

C2. Overview at the top of /admin/assistant: lead counts by status; first emails and follow-ups waiting for approval; threads needing attention; targets awaiting review; contact forms pending; last inbox sync time; last campaign send time; today's sends versus the daily cap; bounce rate of the last 20 sends; a link to each area. Use the existing dashboard components.

C3. Daily summary email: cron endpoint /api/internal/cron/daily-digest plus disabled systemd service and timer (08:30 IST). It queues one email through the existing email outbox to the admin's email address (the first active admin user, overridable by a new `digestEmail` field in assistant settings; setting `digestEnabled` default true). Content: counts only (approvals waiting, replies needing attention, new replies in 24h, new interested leads, targets to review, forms pending, sends yesterday, bounces yesterday) plus links into /admin/assistant. No candidate or personal data beyond company names. Send nothing if every count is zero. One digest per day maximum.

C4. Tests for the pause behaviour, the overview queries (mocked), and digest content and once-per-day logic.

## TASK B: SAFE AUTO-REPLIES FOR support@ (NO AI)

- Matching: for an inbound thread on the support account, match against FAQ entries with a deterministic keyword-overlap score and a documented threshold. Add `safe_to_auto_send` boolean (default false) to FAQ entries and a global `autoReplySafe` setting (default false).
- Behaviour: a confident match always creates a DRAFT reply. It is sent automatically only if `autoReplySafe` is on AND the matched entry is safe_to_auto_send AND the thread category is not complaint, payment, legal, opt-out, bounce or out-of-office AND the sender is not suppressed and not an automated sender (Auto-Submitted, Precedence bulk/junk/list, List-Id, no-reply addresses) AND sending is not paused AND no auto-reply was already sent in that thread. Hard limit: 1 auto-reply per thread, 20 per day overall. Everything else goes to the needs-attention list.
- Add a Reply-To of support@ravelyth.in to system emails sent from noreply@ if it is missing, so replies reach the support mailbox. Verify with a test on the email layout.
- Tests for each rule above, including automated-sender detection and the per-thread and daily limits.

## TASK D: PLAN LIMITS, FREE POSTS, INTERNSHIPS

D1. Free posts: change the default of the free job posts setting to 3 for new installs and, in an idempotent data update (seed or migration), set the existing singleton site_settings value to 3 only if it is currently 1. Update all copy that mentions "first job post free" (register page, pricing page, emails, default policies, social text, outreach templates) to read the number from the setting instead of hard-coding.

D2. Monthly job-post limits, keeping all prices unchanged: Basic 9, Professional 20, Business 30, Enterprise 55. Update through the idempotent seed (upsert of plan entitlements) so existing rows change. Pricing page and dashboards must read the numbers from the database.

D3. Internships (additive migration):
- New nullable job fields: stipend_type (paid, unpaid, performance_based), stipend_min_paise, stipend_max_paise, duration_months, start_date, eligibility (text), ppo_possible (boolean), certificate_provided (boolean).
- When the job type is Internship the posting form shows these fields, requires stipend_type and duration, and the public job page, cards, search results, emails and social cards display them. Add an /internships page (server-rendered, SEO metadata, JobPosting JSON-LD with employmentType INTERN) with filters (stipend type, duration, city, start date), an Internships section on the home page, and an Internship filter on the main search. Existing jobs are untouched.
- The safety scan must flag internships that ask the intern to pay anything (reuse the payment-request rules) and flag unpaid internships labelled as paid.
- Internship quota: separate from the monthly job quota and from the free job credit. Each company gets 5 free internship posts for life (site_settings `free_internship_posts`, default 5, editable by admin; track usage per company). After that each internship post costs Rs 399 (site_settings `internship_post_price_paise`, default 39900, editable). Posting an internship needs NO subscription.
- Payment for extra internships: reuse the existing Razorpay order, verify, webhook and invoice infrastructure for a one-time purchase of N internship credits (default 1) stored as a per-company credit balance. Idempotent webhook handling, invoice generated and emailed, GST wording per the existing settings. A credit is consumed when the internship is submitted and restored if the scan blocks it before going live. Show remaining free internships and credits on the employer dashboard and a clear "Buy internship post (Rs 399)" button when none are left.
- Tests with the Razorpay SDK mocked: free quota, paid credit purchase, idempotency, consumption and restoration, no interference with the job quota, and authorization.

## TASK E: CHAT BETWEEN EMPLOYERS AND CANDIDATES

E1. Schema (additive): `chat_conversations` (job_id, company_id, candidate_user_id, application_id nullable, pre_apply boolean, status open/closed, created_at, last_message_at), `chat_messages` (conversation_id, sender_user_id, sender_side candidate/employer, body, flagged boolean, created_at, read_at), `chat_reports` (message or conversation, reporter, reason, status), `chat_blocks` (blocker_user_id, blocked_user_id), a chat_mute_until timestamp on users for auto-mutes. Add `companies.chat_enabled` (default true) and `companies.chat_before_apply_enabled` (default false), with toggles in the employer company settings: "Allow chat with candidates" and "Allow candidate questions before they apply".

E2. Rules, enforced on the server:
- After a candidate applies to a job, both sides can message each other while chat_enabled is true.
- Before applying, a candidate may send exactly ONE message per job, only if chat_before_apply_enabled is true; further messages are allowed only after the employer replies. Employers cannot start conversations before an application exists.
- Any active member of the company may reply; show the replier's first name plus the company name.
- Plain text only, max 1000 characters, no attachments, escaped on render, links not clickable. Rate limits: 20 messages per hour per user and 5 new conversations per day per candidate. No contact details are shared unless the user types them.
- Safety: reuse the scam-scan payment-request rules to flag a message; flagged messages are delivered with a warning to the recipient, count toward a per-user counter, and 3 flagged messages in 24 hours auto-mutes the sender for 24 hours. Show "Never pay money to get a job" in every conversation. Report and Block buttons for both sides. A blocked user cannot send.
- Candidates must not be able to see other candidates' conversations; companies must not see other companies' conversations; test every IDOR path.

E3. UI: /dashboard/messages and /recruiter/messages (conversation list with unread counts, thread view). Refresh by polling every 10 seconds only while the page is open (no websockets). "Ask a question" on a job page when allowed; "Message" on applicant cards. In-app notification for each new conversation, and an email notification through the outbox at most once per hour per conversation with a link back (no message text in the email).

E4. Admin: /admin/chat-reports showing only reported conversations; opening one writes an audit log entry. Deleting a user also deletes their conversations and messages (extend the existing admin deletion code and its tests). Update the default Privacy Policy and Terms text: chat messages are stored, reviewed only when reported, and deleted with the account.

E5. Tests: every rule above, authorization, rate limits, flagging and auto-mute, toggles, user deletion cleanup.

## TASK F: QUALITY, DOCS AND FINAL REPORT

- Run typecheck, lint, build and all tests. Update ASSUMPTIONS.md, KNOWN_ISSUES.md, TESTING.md, SECURITY_NOTES.md and .env.example (add no new secrets).
- Commit locally after each of Tasks A to E.

FINAL REPORT: what changed per task; every new migration filename and what it does (note that 0017 from Phase 2 and any earlier unapplied migration must also be applied); new settings and defaults; new systemd timer files (crawl-targets, daily-digest) and exact enable commands; anything unfinished or not verified against a real database, mail server or network; exact browser test steps for me; and the deploy steps (git pull, npm ci --include=dev, db:migrate, seed, build, restart, enable timers).
