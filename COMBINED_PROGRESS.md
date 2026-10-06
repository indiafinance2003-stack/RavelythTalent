# Combined task progress

- [x] Task 1: Candidate-to-employer conversion and switch-back
- [x] Task 2: Opt-in job-alert notifications and unsubscribe
- [x] Task 3: Salary insights grouping fix and regression coverage
- [ ] Task 4: Shared Asia/Kolkata date/time formatting
- [ ] Task 5: Role/status-safe password reset email reliability
- [ ] Task 6: Safe admin account deletion
- [ ] Task 7: Admin assistant inbox, leads, campaigns, and optional AI
- [ ] Task 8: Admin, candidate, and employer dashboard redesign
- [ ] Final quality gates, documentation, and deploy report

## Current task

Task 1 is complete and locally committed (`5cd61f9`); Task 2 is complete and
locally committed (`4c80ba5`). Task 3 implementation and generated-SQL tests
are complete; its local commit is pending. PostgreSQL execution was unavailable
because the local credentials are known to fail authentication. Task 4 is next:
audit date/time rendering surfaces and replace them with one shared
Asia/Kolkata formatter using `06 Oct 2026, 5:07 pm IST`.
