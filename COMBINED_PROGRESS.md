# Combined task progress

- [x] Task 1: Candidate-to-employer conversion and switch-back
- [x] Task 2: Opt-in job-alert notifications and unsubscribe
- [x] Task 3: Salary insights grouping fix and regression coverage
- [x] Task 4: Shared Asia/Kolkata date/time formatting
- [ ] Task 5: Role/status-safe password reset email reliability
- [ ] Task 6: Safe admin account deletion
- [ ] Task 7: Admin assistant inbox, leads, campaigns, and optional AI
- [ ] Task 8: Admin, candidate, and employer dashboard redesign
- [ ] Final quality gates, documentation, and deploy report

## Current task

Task 1 is complete and locally committed (`5cd61f9`); Task 2 is complete and
locally committed (`4c80ba5`); Task 3 is complete and locally committed
(`8c68aee`); Task 4 is complete and ready for its local commit. The shared
`formatIndianDateTime` helper applies `Asia/Kolkata` and the required
`DD Mon YYYY, h:mm am/pm IST` format across date displays, notification cards,
interview/password emails, billing emails and invoice PDFs. Typecheck, lint
and the formatter unit tests passed. Next: Task 5, audit the password-reset
flow so verified active accounts of every role are handled case-insensitively,
with generic responses and admin-visible records for suppressed attempts.
