# Combined task progress

- [x] Task 1: Candidate-to-employer conversion and switch-back
- [x] Task 2: Opt-in job-alert notifications and unsubscribe
- [ ] Task 3: Salary insights grouping fix and regression coverage
- [ ] Task 4: Shared Asia/Kolkata date/time formatting
- [ ] Task 5: Role/status-safe password reset email reliability
- [ ] Task 6: Safe admin account deletion
- [ ] Task 7: Admin assistant inbox, leads, campaigns, and optional AI
- [ ] Task 8: Admin, candidate, and employer dashboard redesign
- [ ] Final quality gates, documentation, and deploy report

## Current task

Task 1 is complete and locally committed (`5cd61f9`). Task 2 implementation and
policy tests are complete; its local commit is pending. Task 3 is next: inspect
salary-insights aggregation and raw SQL GROUP BY queries, fix selected/grouped
columns without weakening the five-posting threshold, add regression tests, and
attempt a local PostgreSQL exercise without changing production configuration.
