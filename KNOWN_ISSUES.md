# Known issues

## Blocked or incomplete

- **MEDIUM — conversion needs database-backed verification:** Task 1 adds
  candidate/employer conversion and switch-back policy tests, but PostgreSQL
  authentication remains unavailable, so the transaction, session rotation,
  company creation, and queued confirmation email still need staging
  verification. Additive migration `0008_flimsy_black_tarantula.sql` has not
  been applied locally.
- **MEDIUM — job-alert flow needs provider/database verification:** Task 2
  tests matching, consent, India-day delivery caps and unsubscribe policy as
  pure logic. Registration-to-alert persistence, publish-hook notifications,
  concurrent outbox suppression and SMTP delivery still require staging
  verification. Additive migration `0009_flaky_colossus.sql` has not been
  applied locally.
- **MEDIUM — salary insight SQL not exercised against PostgreSQL:** Task 3 adds
  a generated-SQL regression check and retains the five-posting threshold, but
  application database authentication is unavailable. The query and empty
  state still need a staging/local PostgreSQL smoke test.
- **LOW — Indian date formatting has unit coverage only:** Task 4 tests the
  required UTC-to-Asia/Kolkata format and invalid/absent values. A browser
  walkthrough and visual inspection of real email/PDF output remain part of
  staging verification; the formatter itself does not require database access.
- **MEDIUM — password-reset email persistence needs database verification:**
  Task 5 policy tests cover all account roles and active/suspended/deactivated
  statuses, plus unverified, deleted and unknown addresses. The case-insensitive
  lookup, password token/outbox transaction, and suppressed-reason rendering
  still require a staging/local PostgreSQL smoke test because local database
  authentication is unavailable.
- **MEDIUM — account deletion needs database/filesystem walkthrough:** Task 6
  policy tests cover self/admin guards, paid-payment/invoice blocks and the
  owned-company deletion decision. PostgreSQL cascade/ownership-transfer
  behavior and successful/failed local-file cleanup need a staging test; local
  PostgreSQL authentication is unavailable.
- **BLOCKER — local PostgreSQL credentials:** PostgreSQL is installed and
  running, but application authentication to the local database fails. A prior
  bootstrap attempt changed the local `postgres` password before failing; its
  generated password was not retained. Do not enable trust authentication as a
  workaround. Migrations and seeds have not been applied to a local database.
- **HIGH — database-backed flows not exercised:** The unit suite has 260
  passing tests across 40 Vitest files, including mocked Razorpay
  owner/activation coverage, but it does not replace DB-backed tests for
  free-post quota consumption, moderation/report persistence, offline billing
  transactions, invoices, or the admin search flow. Those require a working
  local/staging PostgreSQL database.
- **MEDIUM — live providers not configured:** Razorpay checkout/webhooks,
  production SMTP and a real SMS provider have not been exercised against live
  services. Razorpay SDK order creation is mocked in unit tests.
- **MEDIUM — deployment validation:** Nginx, systemd (`systemd-analyze
  verify`) and `shellcheck` tools were unavailable on Windows; the new
  off-site backup script was checked with `bash -n` only. Deployment,
  backup/restore and restart behavior still need validation on the target
  Ubuntu host.
- **MEDIUM — browser verification:** No authenticated browser walkthrough
  against a working database was possible. Use the manual scenarios in
  `TESTING.md` on staging before launch.
- **HIGH — development dependency advisories:** Five high-severity npm audit
  findings remain in the ESLint/Next lint dependency chain
  (`eslint-config-next` -> `fast-glob` -> `micromatch` -> `braces`);
  `npm audit fix` (non-force) was applied during Task 10 and bumped the lint
  packages within their declared range without clearing them, while
  `npm audit --omit=dev` reports zero production vulnerabilities. See
  `SECURITY_NOTES.md` for reachability and the recommendation.
- **MEDIUM — Assistant (Task 7) needs database and mail-server verification:**
  Additive migrations `0011_closed_timeslip.sql` through
  `0015_late_skullbuster.sql` have not been applied locally (PostgreSQL
  authentication is unavailable), so inbox sync, thread/draft persistence,
  leads CRUD, campaign queueing and approval flows were exercised only
  through mocked/pure-logic tests. Live IMAP/SMTP against mail.ravelyth.in or
  Gmail has not been tested; no real message was read or sent.
- **MEDIUM — Anthropic AI layer unverified:** The Anthropic adapter, safety
  validation, usage recording and cost-cap shutdown are covered with a mocked
  provider only. No live `ANTHROPIC_API_KEY` call was made; token/cost
  estimates are approximate and should be checked against the first real
  usage in the provider console.
- **MEDIUM — Assistant upgrade Phase 1 needs live mailbox and campaign
  verification:** the quoted-text classification fix (`stripQuotedText`), the
  stricter bounce rules, the out-of-office no-side-effect path, CSV outreach
  history import and the follow-up-only campaign activation are covered by 27
  new pure-logic tests only. Real reply shapes (Gmail/Outlook quoting styles,
  DSN formats from Indian mail servers), IMAP persistence of OOO messages, the
  noon-IST history dates written by a real import, and activation of a real
  draft campaign against PostgreSQL are unverified because PostgreSQL
  authentication and a live mail server were unavailable. No migration was
  generated in Phase 1.
- **MEDIUM — Assistant upgrade Phase 2 needs database and cron verification:**
  additive migration `0017_colossal_blackheart.sql`
  (`outreach_campaigns.auto_approve_followups` boolean default false,
  `assistant_settings.no_reply_after_days` integer default 3) has been
  generated but not applied locally. Auto-approved follow-up insertion,
  `markNoReplyLeads()` aggregation queries (max sent-at, pending-status set,
  inbound join), the 60-day no-reply block at activation/send time and the
  `no_reply -> emailed` reset on a fresh send are covered by pure-logic tests
  and code review only; the cron route addition
  (`/api/internal/cron/process-campaigns` now also runs `markNoReplyLeads`)
  was not executed against a live database or CRON_SECRET-protected request.
  One existing test assertion was updated on purpose: the social migration
  test no longer requires itself to be the *newest* drizzle journal entry
  (Phase 2 appends 0017); it still guards that 0016 exists and keeps its
  journal position.
- **LOW — assistant systemd timers unvalidated:** The new
  `ravelyth-cron-sync-inbox` and `ravelyth-cron-process-campaigns`
  service/timer files are added disabled and were not validated with
  `systemd-analyze verify` (Windows environment). Validate on the Ubuntu
  host before enabling.
- **MEDIUM — social auto-posting (Task 9) needs database and Meta API
  verification:** Additive migration `0016_lowly_franklin_storm.sql` (social
  posts, social settings, WhatsApp digests and
  `companies.social_promotion_opt_out`) has not been applied locally because
  PostgreSQL authentication is unavailable. Publish-hook enqueueing, cron
  processing, admin queue actions and the job-card route were covered with
  pure-logic and `fetch`-mocked tests only; no call was made to Meta's Graph
  API and no post was published to the Facebook Page or Instagram account.
  Review the migration SQL (additive only: three new tables, one new column
  with `DEFAULT false`, constraints and indexes) before deploying.
- **LOW — `SOCIAL_GRAPH_VERSION` must be verified by the owner [OWNER
  ACTION]:** the Graph API version is read from `SOCIAL_GRAPH_VERSION`
  (documented default `v26.0` in `.env.example`) instead of being hard-coded.
  Verify the current version against Meta's documentation before the first
  real post and update the variable if Meta has moved on.
- **MEDIUM — dashboard redesign (Task 8) needs a browser walkthrough against
  a real database:** the shared shell, route permissions, data queries and
  server actions were kept intact and the pure pieces (zero-filled IST series,
  match scoring and gating, count/label formatting) are unit tested, but no
  authenticated browser session could be run locally because PostgreSQL
  authentication is unavailable. Verify on staging: all three shells render
  their grouped navigation, the admin overview KPIs/charts/attention/activity
  cards show real values, the candidate dashboard shows the completeness ring
  and recommended jobs only after a profile has data, the employer pipeline
  board's status buttons update the column counts, and the mobile drawer
  opens/closes with Escape, overlay click and route changes.
- **MEDIUM — SMS providers (Task 10) not verified against the live
  services:** the MSG91 (v5 Flow API) and Twilio (Messages resource) adapters
  are covered by mocked-`fetch` tests only. No request was made to
  `control.msg91.com` or `api.twilio.com`, no message was delivered to a real
  handset, and the MSG91 DLT template variable naming (`{{otp}}`/`{{OTP}}`)
  plus the Twilio sender (number or alphanumeric sender ID) still need
  confirmation against each provider's console before first use. OTP stays
  hidden (HTTP 503 on `/api/auth/otp/*`) until a provider is configured, so
  nothing changed for end users.
- **LOW — social systemd timer unvalidated:** The new
  `ravelyth-cron-process-social-posts` service/timer files are added disabled
  and were not validated with `systemd-analyze verify` (Windows environment).
  Validate on the Ubuntu host before enabling.
- **MEDIUM — off-site backup (Task 10) never executed:** The new
  `deploy/scripts/offsite-backup.sh` (syntax-checked with `bash -n`),
  `ravelyth-offsite-backup.{service,timer}` and `deploy/OFFSITE_BACKUP.md`
  ship disabled and were not run: there is no rclone remote, GPG passphrase
  file, systemd or Linux shell on this machine. Before enabling on the
  Ubuntu host, follow `deploy/OFFSITE_BACKUP.md` end to end (rclone wizard,
  `OFFSITE_*` variables in the production `.env`, one manual
  `systemctl start ravelyth-offsite-backup.service`, `rclone ls`
  verification) and confirm the rclone config and passphrase files are
  readable only by `ravelyth`.

Do not treat this application as launch-ready until database access, owner
configuration, staging walkthroughs and the outstanding actions in
`MANUAL_TODO.md` are completed.
