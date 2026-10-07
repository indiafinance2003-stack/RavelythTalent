# Combined task progress

- [x] Task 1: Candidate-to-employer conversion and switch-back
- [x] Task 2: Opt-in job-alert notifications and unsubscribe
- [x] Task 3: Salary insights grouping fix and regression coverage
- [x] Task 4: Shared Asia/Kolkata date/time formatting
- [x] Task 5: Role/status-safe password reset email reliability
- [x] Task 6: Safe admin account deletion
- [x] Task 7: Admin assistant inbox, leads, campaigns, and optional AI
- [x] Task 9: Social auto-posting (Facebook, Instagram, WhatsApp digest)
- [ ] Task 8: Admin, candidate, and employer dashboard redesign
- [ ] Task 10: SMS adapters, npm audit follow-up, off-site backups
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

Task 8 (dashboard redesign) is next: shared card/KPI/table/empty-state
components and responsive navigation, then the admin overview (including the
Social status card that Task 9 left as a note for Task 8), the candidate
dashboard with the documented match function, and the employer dashboard.
Task 10 (MSG91/Twilio adapters, `npm audit`, off-site backups) and the final
quality-gates report follow.
