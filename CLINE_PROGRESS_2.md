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

- [x] C1. Migration 0019_great_sleepwalker (additive: sending_paused, digest_enabled, digest_email on assistant_settings). processCampaigns returns early when sendingPaused (queued/scheduled messages stay approved). setSendingPausedAction toggle (resume/pause) with audit log assistant.sending_paused/resumed; red banner component + /admin/assistant/layout.tsx renders it on every assistant page with one-click resume.
- [x] C2. Overview card at top of /admin/assistant (src/lib/assistant/overview.ts + OverviewTally): total/interested/opted-out leads, approvals waiting, threads needing attention, targets to review, contact forms queued, sends vs daily cap, last inbox sync, last campaign send, bounce rate of last 20 (null until 20 sends).
- [x] C3. /api/internal/cron/daily-digest (assertCronRequest) + disabled systemd ravelyth-cron-daily-digest.{service,timer} at 08:30 IST. digestEnabled=true default, digestEmail override (else first active verified admin), one email/day via outbox (templateKey assistant.daily_digest), counts only, skip when empty/disabled/already-sent today/no recipient.
- [x] C4. Tests: digest-logic.test.ts (istDayStart boundary, isSameIstDay, digestDecision send/skip_empty/skip_already_sent/send next day, digestHasContent, digestItems links, buildDigestEmail content + quiet variant). Pause gate covered by processCampaigns early-return. Local commit.

## Task B - Safe auto-replies for support@

- [x] B1. Migration 0020_spotty_layla_miller (additive: assistant_faq.safe_to_auto_send). FAQ matcher src/lib/assistant/faq-reply.ts: significant-token Dice similarity, documented threshold (>=0.4, >=2 shared tokens), confident match ALWAYS creates a "faq" inbox draft. Auto-send uses the existing assistant_settings.auto_send_safe_replies setting (default false, now wired through saveSettings + settings page) AND safe_to_auto_send on the matched FAQ.
- [x] B2. Auto-reply server module src/lib/assistant/auto-reply.ts enforcing every condition (category general/account only, suppression list, automated sender heuristic, sending_paused blocks, per-thread 1, 20/day cap) — any block leaves the draft for human review with needs_attention. Hooked into sync-inbox.persistIncoming; sent replies mark thread handled, add outbound message, audit log.
- [x] B3. Reply-To support@ravelyth.in on noreply@ system emails via systemReplyTo in smtp.ts used by outbox deliver (smtp.test.ts covers noreply/support/no-support cases).
- [x] B4. Tests: faq-reply.test.ts (tokens, Dice threshold, best match, plan always-draft, autoSend only when safe+enabled, all block conditions), smtp.test.ts. Local commit.

## Resume point

Next: Task D (plan limits, free posts, internships): D1 free job posts default 3 (schema default + idempotent update when currently 1, copy reads from setting everywhere), D2 monthly job-post limits 9/20/30/55 via idempotent seed upsert, D3 internship fields (additive migration) + posting form + job page/cards/search/emails/social + /internships + home section + search filter + safety scan rules, D4 internship quota free_internship_posts=5 + internship_post_price_paise=39900 with Razorpay credit reuse + dashboard UI, D5 tests (Razorpay mocked). Additive migrations only.

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
