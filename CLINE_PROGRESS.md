# Cline task progress

Ordered per `CLINE_PROMPT.md`. Update a checkbox immediately when its
sub-task is complete. Tasks 7, 9, 8, and 10 are committed locally one task at
a time; never push.

## Task 7 - Assistant (support inbox, leads, campaigns, optional AI)

- [x] 7.1 Mail configuration: optional env variables, account resolver, dependency setup, and safe "Not configured" status.
- [x] 7.2 Data model: additive Drizzle migration for inbox, CRM, campaign, suppression, FAQ, settings, and AI usage data.
- [x] 7.3 Inbox sync: bounded UID-based IMAP sync, Message-ID dedupe, threading/classification, secured cron endpoint, systemd timer.
- [x] 7.4 Inbox workflows: admin-only inbox/thread UI, plain-text rendering, drafts/replies, handled and attention flags, notifications.
- [x] 7.5 Company leads: manual/import CRUD, validation/preview, CSV export, status changes/events, suppression and deletion.
- [x] 7.6 Campaigns: templates/sequences, pre-send checks, batch/per-message approval, paced capped sending, unsubscribe page, secured cron/systemd timer.
- [x] 7.7 Optional AI: provider interface/Anthropic adapter, validation/safety/cost cap, FAQ/settings UI, mocked tests; no automatic AI sends.
- [x] 7.8 Task 7 privacy/compliance text, docs updates, quality check, and local commit. Privacy Policy support-email/AI/outreach sections added with tests; ASSUMPTIONS/KNOWN_ISSUES/TESTING/SECURITY_NOTES updated; typecheck/lint/build/143 tests green.

## Task 9 - Social posting and WhatsApp digest

- [ ] 9.1 Settings and opt-out: env variables, social settings, additive migration for company opt-out, employer setting toggle.
- [ ] 9.2 Eligibility and queue: publish hook, eligibility/deduplication, secured processor cron and disabled systemd timer.
- [ ] 9.3 Provider delivery: Facebook/Instagram adapters, caps/windows/retries/token errors, admin queue/history/retry/cancel UI.
- [ ] 9.4 Public cards and content: safe published-job card route, caption builders, provider-mocked tests.
- [ ] 9.5 WhatsApp digest: daily job listing, copy/posted controls and card downloads.
- [ ] 9.6 Task 9 terms/compliance, tests, docs, quality check, and local commit.

## Task 8 - Dashboard redesign

- [ ] 8.1 Shared responsive dashboard components, mobile navigation/drawer, accessible states.
- [ ] 8.2 Admin overview and sidebar, real-data KPIs/analytics/attention/activity and Assistant/Social summaries.
- [ ] 8.3 Candidate dashboard/sidebar with profile completeness, real recommendations/match logic, applications/interviews/alerts and premium state.
- [ ] 8.4 Employer dashboard/sidebar with real KPIs, plan usage, hiring pipeline, job performance, applicants/interviews.
- [ ] 8.5 Component/policy tests, docs, quality check, and local commit.

## Task 10 - Small items

- [ ] 10.1 Implement and test MSG91 and Twilio SMS adapters; retain production refusal for console and hidden OTP when unconfigured.
- [ ] 10.2 Run `npm audit`, remediate without major upgrades, document every remaining advisory and production reachability.
- [ ] 10.3 Add off-server backup script and disabled systemd service/timer with optional GPG and remote retention.
- [ ] 10.4 Document one-time rclone setup and backup operations.
- [ ] 10.5 Final documentation updates, typecheck, lint, build, full tests, and any database/provider verification notes.
- [ ] 10.6 Final local commit and final report with deployment, timer, env, manual test, and unfinished-work details.

## Resume point

Task 7 COMPLETE and committed locally (see `git log`). All Task 7 code,
migrations 0011-0015, systemd timers, privacy-policy text and docs updates
are in. Quality gates green: `npm run typecheck`, `npm run lint`,
`npm run test` (143 tests / 28 files), `npm run build`.

Next: **Task 9 (social auto-posting)**, in order:

1. 9.1 Settings and opt-out: add SOCIAL_* env vars to `.env.example` and
   `src/lib/env.ts`; `social_settings` table + admin UI at
   `/admin/social/settings` (master switch default off, per-platform
   switches, cap 10/day, spacing 20 min, window 09:00-21:00 IST, hashtags,
   caption template, pause-all); additive migration adding
   `companies.social_promotion_opt_out` boolean default false + employer
   toggle in company settings.
2. 9.2 Queue and eligibility: enqueue `social_posts` rows from the existing
   `onJobPublished` hook in `src/lib/jobs/hooks.ts` (published + scan
   decision publish + zero open reports + company not opted out; dedupe per
   job/platform); `/api/internal/cron/process-social-posts` (CRON_SECRET,
   every 10 min) with disabled systemd service/timer; caps/spacing/window,
   retry with exponential backoff max 4 attempts, token-error detection.
3. 9.3 Admin UI `/admin/social`: connection status, queue/history filters,
   retry/cancel, per-job "post now", kill switch; SocialProvider interface
   with Facebook + Instagram adapters (fetch + timeouts, mocked in tests).
4. 9.4 Content: caption builder from public job data only (+UTM), branded
   1080x1080 card via `next/og` ImageResponse at
   `/api/social/card/[jobId]` (404 for non-published, cached briefly).
5. 9.5 WhatsApp digest `/admin/social/digest` (top 10 jobs, copy button,
   mark-posted, card downloads).
6. 9.6 Update default Terms (already partially present - verify opt-out and
   removal clauses), tests (eligibility for every job state, opt-out, caps,
   spacing/window, retry/backoff, expired token, dedupe, caption/card
   contents, 404 - providers mocked), docs, gates, local commit.

Then Task 8 (dashboard redesign), then Task 10 (SMS adapters, npm audit,
offsite backup).

Environment notes: Windows/PowerShell; no local PostgreSQL auth, no live
mail/SMS/Meta credentials, so DB/IMAP/third-party flows are covered by mocked
tests only (record in KNOWN_ISSUES.md). Never touch .env files (only
.env.example), never push, never alter the PostgreSQL install.
