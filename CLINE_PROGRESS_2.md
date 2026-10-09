# Build round 2 progress (CLINE_PROMPT_2.md)

Ordered A, C, B, D, E, F. Update a checkbox immediately after each sub-task is
complete. Local commits only after each task; never push.

## Task A - Targets, website crawler, contact-form queue

- [x] A1. Schema (additive migration 0018_flimsy_gabe_jones.sql): company_targets, target_emails, contact_form_queue + assistant_settings crawl_enabled/crawl_per_run/contact_form_template. Additive only, reviewed.
- [x] A2. /admin/assistant/targets: add form, CSV import with preview client component (+ /api/admin/assistant/targets/preview), CSV export (+ export route). Dedupe by normalized domain (in-file and against DB).
- [x] A3. Crawler (src/lib/assistant/crawler/network|robots|extract + crawl.ts): SSRF v4/v6 guards with re-validation per redirect hop, ports 80/443, robots.txt, 8s timeout, 1MB cap, text/html only, 6-page cap, 1s same-host delay, concurrency 2, mailto+text extraction, HR ranking, role blocklist, MX check, suppressed/lead dedupe, form detection, statuses. Cron /api/internal/cron/crawl-targets (CRON_SECRET, crawlPerRun=20, crawlEnabled=true), "Crawl selected now" action, disabled systemd service+timer (30 min).
- [x] A4. Review UI: status filter + search, per-target detail with HR-highlighted emails and MX badges, approve selected emails to leads (lead event links back), reject, add manual email, re-crawl, send contact-form-only target to queue.
- [x] A5. /admin/assistant/contact-forms queue with prepared message, Copy button, Mark done/Skip, real counts. Never auto-submit.
- [x] A6. Tests: SSRF v4/v6 + redirects, robots parsing/disallow-all/allow, extraction/ranking/blocklist/obfuscation, form detection, CSV validation + dedupe, cron secret protection. Mocked network only. Local commit.

## Task C - Pause switch, overview, daily summary email

- [ ] C1. sending_paused (default false), pause honored by process-campaigns and auto replies, red banner on every /admin/assistant page, audit-logged.
- [ ] C2. Overview card at top of /admin/assistant (counts, links, last sync/send, sends vs cap, bounce rate of last 20).
- [ ] C3. /api/internal/cron/daily-digest + disabled systemd timer (08:30 IST), digestEnabled=true, digestEmail override, one email/day via outbox, counts only.
- [ ] C4. Tests for pause, overview queries, digest content and once-per-day logic. Local commit.

## Task B - Safe auto-replies for support@

- [ ] B1. Keyword-overlap FAQ matching with documented threshold; safe_to_auto_send on FAQ + autoReplySafe setting (default false); confident match always creates a DRAFT.
- [ ] B2. Auto-send conditions (category, suppression, automated sender, paused, per-thread 1, 20/day); everything else to needs-attention.
- [ ] B3. Reply-To support@ravelyth.in on noreply@ system emails; layout test.
- [ ] B4. Tests for each rule. Local commit.

## Task D - Plan limits, free posts, internships

- [ ] D1. free job posts default 3 (schema default + idempotent update when currently 1); copy reads from setting everywhere.
- [ ] D2. Monthly job-post limits 9/20/30/55 via idempotent seed upsert; pages read DB.
- [ ] D3. Internship fields (additive migration), posting form, job page/cards/search/emails/social display, /internships page + home section + search filter, safety scan rules.
- [ ] D4. Internship quota: free_internship_posts=5, internship_post_price_paise=39900, no subscription needed, credits via Razorpay reuse, consume/restore, dashboard UI.
- [ ] D5. Tests (Razorpay mocked). Local commit.

## Task E - Chat between employers and candidates

- [ ] E1. Schema: chat_conversations, chat_messages, chat_reports, chat_blocks, users.chat_mute_until, companies.chat_enabled (true), companies.chat_before_apply_enabled (false); employer toggles.
- [ ] E2. Server-enforced rules (post-apply messaging, one pre-apply message, rate limits, flagging + auto-mute, blocks, IDOR).
- [ ] E3. UI: /dashboard/messages, /recruiter/messages (poll 10s), job page "Ask a question", applicant "Message", in-app notification, hourly outbox email per conversation.
- [ ] E4. Admin /admin/chat-reports with audit log on open; user deletion cleanup; privacy/terms text updates.
- [ ] E5. Tests for every rule. Local commit.

## Task F - Quality, docs, final report

- [ ] F1. typecheck, lint, build, all tests green.
- [ ] F2. Update ASSUMPTIONS.md, KNOWN_ISSUES.md, TESTING.md, SECURITY_NOTES.md, .env.example (no new secrets).
- [ ] F3. Final report delivered.

## Resume point

Next: Task A1 (schema tables + additive migration 0018).
