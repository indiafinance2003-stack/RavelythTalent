# Combined task progress

- [x] Task 1: Candidate-to-employer conversion and switch-back
- [x] Task 2: Opt-in job-alert notifications and unsubscribe
- [x] Task 3: Salary insights grouping fix and regression coverage
- [x] Task 4: Shared Asia/Kolkata date/time formatting
- [x] Task 5: Role/status-safe password reset email reliability
- [ ] Task 6: Safe admin account deletion
- [ ] Task 7: Admin assistant inbox, leads, campaigns, and optional AI
- [ ] Task 8: Admin, candidate, and employer dashboard redesign
- [ ] Final quality gates, documentation, and deploy report

## Current task

Task 1 is complete and locally committed (`5cd61f9`); Task 2 is complete and
locally committed (`4c80ba5`); Task 3 is complete and locally committed
(`8c68aee`); Task 4 is complete and ready for its local commit. The shared
(`8c68aee`); Task 4 is complete and locally committed (`dc5b628`). The shared
`formatIndianDateTime` helper applies `Asia/Kolkata` and the required
`DD Mon YYYY, h:mm am/pm IST` format across date displays, notification cards,
interview/password emails, billing emails and invoice PDFs. Typecheck, lint
and formatter unit tests passed. Task 5 is implemented and ready for its local
commit: verified active accounts of every role now use a case-insensitive
address lookup, and unknown/unverified/deleted/inactive requests are recorded
as suppressed outbox rows with admin-visible reasons. Migration
`0010_regular_darwin.sql` only adds the `suppressed` email status. Typecheck,
lint and focused policy tests passed. Next: Task 6, implement admin-only,
typed-confirmation account deletion with payment/invoice guards and one
transaction.
