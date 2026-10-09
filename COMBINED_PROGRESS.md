# Combined task progress

- [x] Task 1: Candidate-to-employer conversion and switch-back
- [x] Task 2: Opt-in job-alert notifications and unsubscribe
- [x] Task 3: Salary insights grouping fix and regression coverage
- [x] Task 4: Shared Asia/Kolkata date/time formatting
- [x] Task 5: Role/status-safe password reset email reliability
- [x] Task 6: Safe admin account deletion
- [x] Task 7: Admin assistant inbox, leads, campaigns, and optional AI
- [x] Task 9: Social auto-posting (Facebook, Instagram, WhatsApp digest)
- [x] Task 8: Admin, candidate, and employer dashboard redesign
- [x] Task 10: SMS adapters, npm audit follow-up, off-site backups
- [x] Final quality gates, documentation, and deploy report
- [x] Assistant upgrade Phase 1: safety fixes (quoted-text classification, OOO handling, CSV outreach history, follow-up-only activation)
- [x] Assistant upgrade Phase 2: sequence automation (auto-approved follow-ups, no_reply status)

## Assistant upgrade — Phase 1 (safety fixes)

Phase 1 is complete (no migration required). `classification.ts` now exports
`stripQuotedText()` so reply classification only sees the sender's new text
(stop markers: `On ... wrote:` including the two-line form, Original/Forwarded
Message separators, 5+ underscores, Outlook `From:` + `Sent:`/`Date:` blocks;
`>` lines are skipped). Bounce detection is restricted to mailer-daemon/
postmaster/"mail delivery subsystem" senders, delivery-failure phrases in the
subject, and `Final-Recipient:`/`X-Failed-Recipients:` DSN header lines — the
loose `5.x.x` body match is gone. The opt-out phrase list follows the spec
(no bare "stop"), and out-of-office also matches "autoreply". A new pure
`inboundMessageEffects()` helper makes `persistIncoming` skip lead-status
changes, `campaign_messages` updates and admin notifications for
`out_of_office` replies while still saving the message, thread and
classification. `parseLeadCsv` accepts optional `Status`/`Last Contacted`
columns (multiple header aliases, four date formats stored at 12:00 noon IST,
emailed-without-date is a row error, date-without-status implies `emailed`) and
`importLeadsImpl` persists the history and records the real status in the
`csv_import` event; the leads import card documents the columns. The new pure
`planCampaignStep()` in `campaign-rules.ts` makes already-emailed leads
(`status === "emailed"`, `lastContactedAt` set, no `sent` campaign message)
start at step 2 scheduled `max(now, lastContactedAt + delayDays)` with the
14-day rule ignored and a skip when follow-up 1 is disabled;
`activateCampaignImpl` uses it and logs `firstEmails`/`followUps` counts in the
activation audit metadata. Typecheck, lint and 287 tests / 40 files pass.

## Assistant upgrade — Phase 2 (sequence automation)

Phase 2 is complete with additive migration
`0017_colossal_blackheart.sql` (two `ADD COLUMN ... DEFAULT ... NOT NULL`
statements; not applied locally - PostgreSQL authentication is unavailable).
`outreach_campaigns.auto_approve_followups` (default `false`) is exposed as
the "Auto-approve follow-ups after I approve the first email" checkbox, saved
through `saveCampaignAction` with the usual zod validation; when the flag is
on, the follow-up message created after a send in `process-campaigns` is
inserted as `approved` with `approvedAt` set and no approver user - every
send-time check (suppression, replied, bounced, caps, window, spacing,
bounce-rate pause) still applies at send time. The `no_reply` lead status was
added to `LeadStatus`, `leadStatuses` (so every admin filter, badge, bulk
select and the AI suggestion enum pick it up automatically) and the CSV
mapping ("no reply"/"no response"); `assistant_settings.no_reply_after_days`
(default 3, form field on the settings page) drives the new pure
`shouldMarkNoReply()` decision in `src/lib/assistant/no-reply.ts`, whose
`markNoReplyLeads()` runs from the existing
`/api/internal/cron/process-campaigns` route (no new timer), writes one
`no_reply_marked` lead event per lead and one summary audit log per run with
markings. `campaignLeadBlockReasons` gained the optional
`noReplyContactedWithin60Days` input ("Lead did not reply to a previous full
sequence; wait 60 days."), used both at activation (`planCampaignStep`
computes it from status + last contact + now) and at send time. A `no_reply`
lead that receives a fresh first email returns to `emailed` on send, and the
new pure `inboundLeadStatus()` helper (used by `persistIncoming`) guarantees a
later real reply moves it back to `replied`. The social-migration test's "is
the newest journal entry" assertion was updated to "exists after 0015" because
0017 now exists (guard preserved). Typecheck, lint and 298 tests / 41 files
pass.

## Current task

Task 1 is complete and locally committed (`5cd61f9`); Task 2 is complete and
locally committed (`4c80ba5`); Task 3 is complete and locally committed
(`8c68aee`); Task 4 is complete and locally committed (`dc5b628`). The shared
`formatIndianDateTime` helper applies `Asia/Kolkata` and the required
`DD Mon YYYY, h:mm am/pm IST` format across date displays, notification cards,
interview/password emails, billing emails and invoice PDFs. Typecheck, lint
and formatter unit tests passed. Task 5 is complete and locally committed
(`0a6ec8c`): verified active accounts of every role now use a case-insensitive
address lookup, and unknown/unverified/deleted/inactive requests are recorded
as suppressed outbox rows with admin-visible reasons. Migration
`0010_regular_darwin.sql` only adds the `suppressed` email status. Task 6 is
complete and locally committed (`eee4fa1`). The admin form requires the typed
email; the transaction blocks admins/self and financial records, removes user
data, removes a sole-member company or transfers ownership to an active
teammate, and writes a minimal audit row. Resume, built-resume and verification
files are cleaned after commit with visible failure reporting. Typecheck, lint
and deletion policy tests passed.

Task 7 is complete and locally committed (migrations `0011`-`0015`,
`/admin/assistant`, inbox sync, CRM, campaigns and the mocked optional AI).
Task 9 is complete and locally committed: `social_settings` and
`social_posts` plus `companies.social_promotion_opt_out` arrive in additive
migration `0016_lowly_franklin_storm.sql`; publishing a clean, opted-in job
enqueues one row per enabled platform, `/api/internal/cron/process-social-posts`
(CRON_SECRET, disabled systemd timer) applies the IST window, daily cap,
20-minute spacing and 4-attempt exponential backoff, and
`/admin/social` covers connection status, queue/history filters, retry,
cancel, post-now and the kill switch. Captions and the 1080x1080 card at
`/api/social/card/[jobId]` use public job data only, and
`/admin/social/digest` generates the manual WhatsApp message. Terms now state
the promotion permission, the employer opt-out and Ravelyth's right to remove
posts. Typecheck, lint, build and 193 tests pass.

Task 8 (dashboard redesign) is complete and locally committed: one shared
client shell (`DashboardShell`) now drives all three route groups with a navy
sidebar (grouped admin menu, brief-mandated candidate and employer orders),
sticky top bar with scope search/attention bell/initials avatar, accessible
mobile drawer (Escape, overlay, route-change close, focus return) and the
existing `logoutAction`. The admin overview reads real KPIs, revenue-by-month
line, 30-day signups bars, jobs-by-category donut, needs-attention and recent
activity from `src/lib/admin/overview.ts` plus the deferred Assistant and
Social status cards, with `/admin` and `/admin/users?q=` searches wired to
the top bar. The candidate dashboard shows the completeness ring, plan card,
application tracker, upcoming interviews, alerts totals and deterministic
recommended jobs (`src/lib/jobs/match.ts`, weights 50/30/20, hidden until
the profile has data). The employer dashboard adds quota/plan KPIs, a
button-driven pipeline board reusing the existing status-change action (now
revalidating `/recruiter`), a views-vs-applications chart, interviews and
recent jobs. Zero-filled IST series helpers, match scoring and formatting are
unit tested; route-group `loading.tsx` skeletons were added. Typecheck, lint,
build and 240 tests pass.

Task 10 (MSG91/Twilio adapters, `npm audit`, off-site backups) is complete
and locally committed. `src/lib/sms/providers/{msg91,twilio}.ts` are real
adapters (MSG91 v5 Flow API, Twilio Messages resource) behind a shared
timeout helper and `isConfigured()`; `smsProviderAvailable()` is true only
for a fully credentialled real provider, so `/api/auth/otp/*` keeps
answering 503 and the console provider is still refused in production (20
mocked-`fetch` tests in `src/lib/sms/providers.test.ts`; live delivery
unverified - KNOWN_ISSUES). `npm audit fix` (never `--force`) bumped
`eslint-config-next` to 16.4.0 in the lockfile; the five remaining highs
are one dev-only chain and `npm audit --omit=dev` is clean (SECURITY_NOTES).
New additive-only deploy files: `deploy/scripts/offsite-backup.sh`,
`systemd/ravelyth-offsite-backup.{service,timer}` (disabled) and
`deploy/OFFSITE_BACKUP.md` - newest DB dump plus daily uploads archive to
an rclone remote, optional GPG passphrase-file encryption, 30-day remote
retention, configured by the new `OFFSITE_*` entries in `.env.example`.
ASSUMPTIONS gained section 19 (SMS) and 20 (off-site backups). Final gates:
typecheck, lint, build and 260 tests / 40 files all pass; Task 10 added no
migration. The CLINE_PROMPT final report was delivered in the session.
