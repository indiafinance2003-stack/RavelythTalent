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

Step 1 review of the pre-existing uncommitted working tree against 9.1-9.6,
then Step 2 completion of the gaps that review found. Nothing that already
satisfied the spec was rewritten.

- [x] 9.1 Settings and opt-out: env variables, social settings, additive migration for company opt-out, employer setting toggle.
      Already complete when reviewed: `SOCIAL_*` in `.env.example` +
      `src/lib/env.ts`; `social_settings` singleton (master switch default
      off, per-platform switches, cap 10, spacing 20, window 09:00-21:00,
      hashtags, caption template, pause-all, token-error banners);
      `/admin/social/settings`; migration 0016 adds
      `companies.social_promotion_opt_out` (`DEFAULT false NOT NULL`);
      employer toggle on `/recruiter/company`. Completion: the default
      caption template now uses the supported `{{location}}` variable
      (schema + migration + snapshot, still uncommitted so edited in place).
- [x] 9.2 Eligibility and queue: publish hook, eligibility/deduplication, secured processor cron and disabled systemd timer.
      Already present: `onJobPublished` -> `enqueueSocialPostsForJob`,
      pure `socialPostEligibility`/`planEnqueue`, unique index
      `(job_id, platform)` + `onConflictDoNothing` dedupe, eligibility
      re-check immediately before send, `/api/internal/cron/process-social-posts`
      (CRON_SECRET), disabled systemd service+timer (every 10 min), retries
      with exponential backoff (10/20/40 min, max 4 attempts), token-error
      detection + admin banner. Completion: `src/lib/social/migration.test.ts`
      pins the dedupe index, the documented defaults and that 0016 is
      additive only.
- [x] 9.3 Provider delivery: Facebook/Instagram adapters, caps/windows/retries/token errors, admin queue/history/retry/cancel UI.
      Already present: `SocialProvider` with Facebook (Page `/photos`) and
      Instagram (container -> poll -> publish) adapters, fetch + 15 s
      timeouts, caps/spacing/IST window gates, retry/backoff, token-error
      recording, `/admin/social` connection cards, queue/history filters,
      retry/cancel, per-job "post now". Completion: pause/kill-switch quick
      action on `/admin/social` (`setSocialPauseAction`, audited) and
      `providers.test.ts` exercising both adapters with `fetch` mocked,
      including expired-token (401/403, Graph error 190) handling.
- [x] 9.4 Public cards and content: safe published-job card route, caption builders, provider-mocked tests.
      Completion (defects found in Step 1 and fixed): `{{location}}` is now a
      supported variable, unknown `{{...}}` tokens are stripped before
      publishing, job type and work mode are always in the post text,
      hashtags are placed before the Instagram "Link in bio" line, the card
      model moved into `src/lib/social/card.ts`, and the 3 unused-import
      lint warnings are gone. New `card.test.ts` covers brand colours,
      the "Apply at ravelyth.in" line, hidden/no salary and the absence of
      private data. `/api/social/card/[jobId]` still 404s for anything not
      currently published.
- [x] 9.5 WhatsApp digest: daily job listing, copy/posted controls and card downloads.
      Already complete when reviewed: `/admin/social/digest` lists up to 10
      jobs published on the chosen IST date with emoji bullets, footer,
      copy button, `whatsapp_digests` "mark as posted" and per-job card
      downloads; manual only, no automation.
- [x] 9.6 Task 9 terms/compliance, tests, docs, quality check, and local commit.
      Terms opt-out/removal clauses were already in
      `default-policies.ts`/`.test.ts`. Completion: content clamp test made
      platform-aware, provider/card/migration tests added, ASSUMPTIONS 17,
      KNOWN_ISSUES (incl. the required `SOCIAL_GRAPH_VERSION` owner
      verification note), TESTING (checks + staging step 16) and
      SECURITY_NOTES sections written, `COMBINED_PROGRESS.md` refreshed,
      gates green (typecheck, lint, build, 193 tests / 34 files), local
      commit.

**Note for Task 8:** the admin overview still needs the small **Social
status card** (connection status, posts today, failures) that 9.2 defers
until Task 8 builds the overview - see checklist item 8.2.

## Task 8 - Dashboard redesign

- [ ] 8.1 Shared responsive dashboard components, mobile navigation/drawer, accessible states.
- [ ] 8.2 Admin overview and sidebar, real-data KPIs/analytics/attention/activity and Assistant/Social summaries.
  (Includes the **Social status card** deferred from Task 9.2: connection
  status, posts today, failures - see the Task 9 note above.)
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

Task 7 COMPLETE and committed locally. Task 9 COMPLETE and committed
locally: social settings/queue/providers/card/digest code, additive
migration `0016_lowly_franklin_storm.sql` (+ snapshot), the disabled
`ravelyth-cron-process-social-posts` service/timer, the Terms
opt-out/removal clauses, ASSUMPTIONS/KNOWN_ISSUES/TESTING/SECURITY_NOTES/
COMBINED_PROGRESS updates. Quality gates green: `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run test` (193 tests / 34 files), and
`npm run db:generate` reports "No schema changes, nothing to migrate"
(snapshot 0016 matches the schema).

Next: **Task 8 (dashboard redesign)**, in order:

1. 8.1 Shared responsive components (card, KPI card, stat trend, chart
   wrapper, status chip, table, empty state), mobile drawer navigation,
   accessible focus states, skeleton loaders. Use existing brand tokens
   (navy #0B2A6F, royal blue #1F6FEB, teal #3DB8B0, sky #DCEBFB, mint
   #C8EEE7, off-white #FAFAF8, Plus Jakarta Sans), rounded-2xl cards,
   lucide icons, the existing Logo component; lightweight SVG charts (add
   recharts only if already installed - it is not).
2. 8.2 Admin overview + grouped sidebar/top bar: greeting, real KPI cards,
   revenue-by-month line, signups/day bars (30 days), jobs-by-category
   donut, "Needs attention" table, recent audit activity, Assistant card,
   and the **Social card** deferred from Task 9 (connection status, posts
   today, failures). Keep every existing route/permission/query working.
3. 8.3 Candidate dashboard/sidebar: profile-completeness ring, Go
   Premium/Premium state, recommended jobs with a documented deterministic
   Match chip (+tests, only when the profile has enough data), application
   tracker, upcoming interviews, job alerts summary.
4. 8.4 Employer dashboard/sidebar: KPIs, plan card with usage bar/expiry
   (Indian time)/Upgrade incl. free-post state, hiring pipeline board using
   the existing status-change actions (buttons, no drag and drop), job
   performance chart, recent applicants, interviews.
5. 8.5 Component/policy tests, docs updates, quality gates, local commit.
   Do not change what any user can see or do; verify with the existing
   authorization tests. Empty states must show real emptiness, never fake
   numbers.

Then Task 10: 10.1 MSG91 + Twilio adapters with mocked tests (console
provider still refused in production, OTP login hidden when unconfigured,
note in KNOWN_ISSUES that they were not verified live); 10.2 `npm audit`
without `--force`, record remaining advisories in SECURITY_NOTES; 10.3
`deploy/scripts/offsite-backup.sh` + disabled service/timer (rclone,
optional gpg, 30-day remote retention); 10.4 `deploy/OFFSITE_BACKUP.md`;
10.5 final docs + gates; 10.6 final commit and the report required by
CLINE_PROMPT (per-task changes, migration names, settings defaults, env
vars, timer enablement, unfinished work, manual browser steps, deploy steps).

Environment notes: Windows/PowerShell; no local PostgreSQL auth, no live
mail/SMS/Meta credentials, so DB/IMAP/third-party flows are covered by mocked
tests only (record in KNOWN_ISSUES.md). Never touch .env files (only
.env.example), never push, never alter the PostgreSQL install.
