# Combined task progress

- [x] Task 1: Candidate-to-employer conversion and switch-back
- [x] Task 2: Opt-in job-alert notifications and unsubscribe
- [x] Task 3: Salary insights grouping fix and regression coverage
- [x] Task 4: Shared Asia/Kolkata date/time formatting
- [x] Task 5: Role/status-safe password reset email reliability
- [x] Task 6: Safe admin account deletion
- [ ] Task 7: Admin assistant inbox, leads, campaigns, and optional AI
- [ ] Task 8: Admin, candidate, and employer dashboard redesign
- [ ] Final quality gates, documentation, and deploy report

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

Task 7 is next; no Task 7 implementation changes have been made yet. Start with
7.1: add the optional inbox variables to `src/lib/env.ts` and `.env.example`
(never `.env`), install/use `imapflow` and `mailparser`, and implement an
environment-only account resolver for support and Gmail that shows
“Not configured” when absent. Do not access noreply@ and never store, log or
display credentials. Then proceed through 7.2 inbox/sync, 7.3 CRM, 7.4
campaigns, 7.5 mocked optional AI, and 7.6 privacy/compliance/tests. Task 8 and
final quality gates remain after Task 7.
