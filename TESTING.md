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
| `npm run test` | Passed: 82 tests across 14 Vitest files |
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
