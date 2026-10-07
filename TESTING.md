# Testing results

Environment: Windows, Node 24.19.0, npm 11.17.0. PostgreSQL 17 is installed
and its service is running on port 5432, but application authentication to the
local database fails. No project `.env` was created or changed. Mailpit is
available locally at `127.0.0.1:1025` (SMTP) and `127.0.0.1:8025` (web UI).

## Final automated checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed; production Next.js build completed |
| `npm run test` | Passed: 260 tests across 40 Vitest files |
| `npm run db:generate` | Passed; generated additive migration `0007_late_fabian_cortez.sql` |
| `npm run db:migrate` | Not run: local app database credentials are unusable; no migration was applied |

Migration `0007_late_fabian_cortez.sql` contains only
`ALTER TABLE site_settings ADD COLUMN jurisdiction_city text`; it does not
rewrite or remove existing data. Prior additive migrations `0005` and `0006`
are also not applied to the local database.

The latest `npm run test:e2e` result remains the previously recorded partial
run: two public smoke tests passed and the DB health test failed because local
database authentication is unavailable. It was not rerun for this change.
Razorpay SDK order creation and candidate/employer owner forwarding are unit
tested with mocks; no live payment or webhook was performed.

Task 4 checks: `npm run typecheck`, `npm run lint`, and
`npm run test -- src/lib/utils.test.ts` passed after the shared timestamp
formatter was applied. The formatter test verifies that
`2026-10-06T11:37:00.000Z` renders exactly as `06 Oct 2026, 5:07 pm IST`;
no database or external service is required for this check.

Task 5 checks: `npm run typecheck`, `npm run lint`, and focused Vitest runs
covering password-reset policy, employer conversion, alerts and salary insights
passed. Password-reset policy cases cover job-seeker, recruiter and admin
accounts across active, suspended and deactivated statuses, as well as
unverified, deleted and unknown addresses. The generated
`0010_regular_darwin.sql` migration only adds the `suppressed` value to the
existing email-status enum. Database-backed password token/outbox delivery was
not exercised because local database authentication is unavailable.

Task 6 checks: `npm run typecheck`, `npm run lint`, and
`npm run test -- src/lib/admin/user-deletion-policy.test.ts` passed. The policy
tests verify that an admin cannot delete themselves or another administrator,
that paid payment/invoice records block deletion, and that a company is deleted
only when it has no other active user-members. The transactional cascade,
ownership transfer and on-disk cleanup remain unverified against PostgreSQL
and real uploaded files.

Task 7 (Assistant) checks: `npm run typecheck`, `npm run lint`,
`npm run build` and `npm run test` (143 tests) passed. Assistant-focused
suites cover rule-based classification and bounce detection with fixture
emails, threading and opt-out handling, every campaign pre-send check,
daily-cap/window/spacing guards, unsubscribe token signing and expiry,
CSV import validation, lead/subscription matching, mocked Anthropic provider
headers and retries, zod rejection of bad or prompt-injected AI output, and
monthly cost-cap shutdown. Migrations `0011`-`0015` were generated with the
normal `db:generate` workflow, reviewed as additive only, and not applied
locally because application database authentication is unavailable. Live
IMAP/SMTP, the Anthropic API and DB-backed inbox/campaign flows were not
exercised; see `KNOWN_ISSUES.md`.

Task 9 (social auto-posting) checks: `npm run typecheck`, `npm run lint`,
`npm run build` and `npm run test` (193 tests) passed. Social-focused suites
cover eligibility for every job state (`draft`, `pending_approval`,
`published`, `rejected`, `paused`, `closed`, `expired`), deleted jobs,
held/blocked scans, open reports, company opt-out and the master/platform/kill
switches; IST posting window, daily cap and minimum spacing; exponential
retry backoff up to 4 attempts; the Facebook and Instagram adapters with
`fetch` mocked, including expired-token (HTTP 401/403, Graph error 190)
handling and the Instagram container -> poll -> publish sequence; caption
contents (public fields only, hidden salary omitted, UTM link, no leftover
template tokens, Instagram ending with the plain URL and "Link in bio");
job-card model contents and brand colours; the 404 rules for non-published
job cards; WhatsApp digest line formatting; and a guard that migration
`0016` is additive only and carries the unique `(job_id, platform)` dedupe
index. Migrations `0016` was generated with the normal `db:generate`
workflow and reviewed as additive only; it was not applied locally because
application database authentication is unavailable. No Meta Graph API call
was made and no queue/cron flow ran against a real database; see
`KNOWN_ISSUES.md`.

Task 8 (dashboard redesign) checks: `npm run typecheck`, `npm run lint`,
`npm run build` and `npm run test` (240 tests) passed. Dashboard-focused
suites cover the zero-filled Asia/Kolkata daily/monthly series helpers, the
sum/collapse chart helpers, Indian count and match-label formatting, and the
deterministic match model (perfect/no-overlap/remote/partial-skill/tolerance
cases, determinism, a missing profile, and the `hasEnoughMatchData` gate that
hides recommendations until a profile carries at least one signal). No
authenticated page could be opened locally because database authentication is
unavailable, so the three shells and their data cards are verified by the
manual walkthrough below; see `KNOWN_ISSUES.md`.

Task 10.1 (SMS adapters) checks: `npm run typecheck` and
`npm run test -- src/lib/sms` (20 tests) passed. The suites mock `fetch` and
cover provider selection from `SMS_PROVIDER`, `smsProviderAvailable()`
(console false; MSG91/Twilio false until every credential exists, true with
them), the MSG91 v5 flow request (auth header, template/sender body,
10-digit recipient, `OTP`/`otp` fields, `type: "error"` handling and
missing-credential refusal before any network call), the Twilio Messages
request (Basic auth, form body with To/From/Body containing the code and
validity window, purpose wording, HTTP failure surfacing and the same
missing-credential refusal), the console provider's production refusal, and
`dispatchOtp()` returning true on success and false on transport failures.
No live call was made to MSG91 or Twilio; see `KNOWN_ISSUES.md`.

Task 10.2 (npm audit) checks: `npm audit` was run without `--force`;
`npm audit fix` bumped `eslint-config-next`/`@next/eslint-plugin-next` from
16.3.8 to 16.4.0 in the lockfile only (within the declared `^16.3.8`
range), `npm run lint` was rerun afterwards and passed. The remaining five
high advisories sit in one dev-only chain and `npm audit --omit=dev`
reports zero production vulnerabilities; details in `SECURITY_NOTES.md`.

Task 10.3/10.4 (off-site backups) checks: `deploy/scripts/offsite-backup.sh`
passed `bash -n` (Git Bash). The script and units cannot be executed on this
Windows machine (no rclone, GPG workflow, systemd or local server), so the
first real run is the manual test in `deploy/OFFSITE_BACKUP.md` step 6 on
the Ubuntu host; see `KNOWN_ISSUES.md`. `.env.example` gained the four
`OFFSITE_*` entries and was re-verified BOM-free after editing.

## Manual staging verification

Use a staging deployment with the current additive migrations and seed data,
working email and (for paid flows) Razorpay test credentials:

1. Apply `0008_flimsy_black_tarantula.sql` and `0009_flaky_colossus.sql`, then
   register and verify a candidate.
   In `/dashboard/settings`, convert with company details and the exact typed
   confirmation. Confirm role/session refresh, company approval behavior,
   conversion email, preserved candidate data, and that recruiter search cannot
   find the hidden profile. Repeat conversion after switching back and verify
   the second company does not receive a fresh free-post allowance.
2. Register one candidate with the job-alert checkbox unticked and another
   with it selected. Confirm only the selected account gets a profile alert.
   Edit its headline, skills and preferred locations and verify the default
   alert updates. Publish a matching and non-matching job; confirm only the
   matching job creates an in-app notification. Set one alert daily and another
   weekly, then confirm the digest sends no more than once per candidate on the
   same India calendar day and contains an unsubscribe link. Click it, then
   verify email consent is off and no queued or later alert is delivered.
3. Enable the salary-insights feature flag and open `/salary-insights` with
   fewer than five comparable disclosed jobs; verify the friendly empty state.
   Add five comparable published INR salary postings and verify the aggregate
   range and sample count render without a PostgreSQL grouping error.
4. While a candidate Premium subscription is active, convert and confirm its
   expiry remains unchanged and the settings warning is shown. On
   `/recruiter/company`, try switching back with a published job, a held job,
   and an active employer subscription; each must show its precise blocker.
   Close/resolve those blockers and confirm switching back restores candidate
   visibility and existing applications/resumes.
5. In `/admin/settings`, set the legal operator/contact details and
   `jurisdictionCity`, set `freeJobPosts` to `1`, and enable automatic company
   approval and clean-job publishing. Save, then verify the public policy
   pages show configured details and omit empty ones.
6. Register a candidate and a recruiter with distinct verified email
   addresses. Confirm a candidate can browse and apply without payment. Confirm
   the recruiter company is approved after email verification.
7. On `/pricing`, verify the employer Free card and legal links. Submit one
   clean job for the company and confirm it publishes and consumes its single
   lifetime credit; try a second post and confirm the upgrade prompt. Check the
   recruiter dashboard count. Separately test a scan-blocked job and confirm
   the free credit remains available; verify rejected/closed/deleted jobs do
   not restore a consumed credit.
8. Submit a clean job and representative scam/payment-request, discriminatory,
   adult, spam, and duplicate examples. Confirm publish, held and blocked
   decisions, the employer-facing reason/email, and held-job reasons in
   `/admin/jobs`. Toggle each automatic approval setting off and confirm the
   manual review flow returns.
9. Report a published test job from three distinct reporters. Confirm the job
   pauses, the report queue and overview counts update, and the admin notice is
   queued.
10. In `/admin/billing`, search a candidate by email and a company by name.
   Confirm only matching active plan types and priced periods are available.
   Activate a test offline subscription, then verify subscription, `offline`
   payment and audit entry. Submit a mismatched owner/plan and confirm the
   actual validation message appears inline.
11. In Razorpay test mode, purchase candidate Premium and an employer plan.
   Confirm both browser verification and webhook replay result in one active
   owner-correct subscription; confirm candidate builder access, recruiter
   Premium badge/ranking, and removal after expiry.
12. Inspect `/privacy`, `/terms`, and `/refund-policy` with settings populated
   and cleared. Confirm the last-updated date, configured jurisdiction, no
   empty-setting placeholders, and policy links next to pricing/checkout.
   Send a test email and inspect that its image is an absolute
   `APP_URL/logo.png` URL with the text brand name as alt text.
13. Verify timestamps in admin, candidate and recruiter pages, notification
   cards, billing history, emails and downloaded invoices use the shared
   `DD Mon YYYY, h:mm am/pm IST` format and reflect India Standard Time.
14. Submit password reset requests for verified active job-seeker, recruiter
   and admin accounts, using mixed-case address input. Confirm each gets the
   generic success response and a queued link. Repeat with unverified,
   suspended, deactivated and soft-deleted accounts and an unknown address;
   confirm the response stays identical, no reset email is queued, and
   `/admin/emails` shows a `suppressed` row with the specific reason.
15. In `/admin/users`, expand Delete account for a non-admin account, confirm
   the displayed data summary, enter the account email and submit. Confirm the
   account and associated profile/resume/application/notification/session/
   alert/built-resume data are gone and uploaded files are removed. Try an
   incorrect email, the logged-in admin, another admin, and an account with a
   captured/refunded payment or invoice; each must be refused with the reason,
   including the instruction to suspend financial accounts instead. Delete a
   recruiter with no other active company members and verify its company,
   jobs, reports, verification documents and company-identity fields are gone.
   Delete a recruiter with active teammates and verify the company remains
   with ownership transferred to an active teammate.
16. Social auto-posting: set `SOCIAL_FACEBOOK_PAGE_ID`,
   `SOCIAL_FACEBOOK_PAGE_TOKEN`, `SOCIAL_INSTAGRAM_USER_ID` and
   `SOCIAL_GRAPH_VERSION` on staging, then open `/admin/social/settings` and
   confirm both platforms show "Connected". Turn the master switch on and
   publish a clean job; confirm two `social_posts` rows appear as `queued`,
   then run
   `curl -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3000/api/internal/cron/process-social-posts`
   inside the posting window and confirm the rows become `published` with a
   platform post id. Repeat with a reported job, a held job and a company that
   has ticked "Do not promote my jobs" in `/recruiter/company`; each must stay
   queued or be skipped, never posted. Visit `/api/social/card/<jobId>` for a
   published job (image) and for a closed job (404). Use "Post now", Retry and
   Cancel from `/admin/social`, toggle the kill switch, and confirm the
   audit-log entries. Generate a digest on `/admin/social/digest`, copy it,
   download a card image and mark it posted.
17. Dashboard shells: sign in as an admin and confirm the navy grouped sidebar
   (Marketplace, Plans and billing, Operations, Content, System), the top-bar
   scope search routing to `/admin/users?q=...`, the attention bell and the
   assistant/social overview cards with real values or honest empty states.
   Sign in as a candidate and confirm the completeness ring, plan card,
   application tracker, upcoming interviews, alerts totals and recommended
   jobs (recommendations must stay hidden until the profile has skills,
   location or experience, and the Match chip must never show on an
   applied job). Sign in as a recruiter and confirm the pipeline board's
   status buttons move an application between columns, update the counts,
   refresh `/recruiter` and keep the candidate notified. Shrink the window
   below 1024px and verify the drawer opens, closes with Escape/overlay
   click/route change, and returns focus to the menu button.

Do not run the migration against production as a validation step. Apply
migrations only through the server deployment procedure and after a database
backup.

## Deployment steps

On the server, from the application directory:

```sh
git pull
npm ci --include=dev
npm run db:migrate
npm run seed
npm run build
sudo systemctl restart ravelyth
```

Check service status and logs, then perform the staging/manual smoke checks
above before directing users to the updated application.
