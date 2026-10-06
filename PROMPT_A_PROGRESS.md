# Prompt A progress

Working checklist for the six requested tasks. Update this file before each
task commit so work can resume without relying on conversation history.

## Task 1 — Free first job post
- [x] Additive schema migration for company free-credit usage and settings.
- [x] Add idempotent `employer_free` plan seed and admin plan visibility.
- [x] Enforce lifetime credit and preserve it through moderation/lifecycle changes.
- [x] Registration anti-abuse, employer pricing/register/dashboard messaging.
- [x] Free-credit warning and limit-reached email templates/dispatch.
- [x] Add focused tests and commit locally.

## Task 2 — Auto-approval and safety checks
- [x] Additive settings/report schema migration.
- [x] Company auto-approval on recruiter email verification.
- [x] Rule-based job scan with documented data-driven rules and tests.
- [x] Central `publishJob(job, actor)` path for automatic/admin/repost publishing.
- [x] Report flow, thresholds, admin queue/counts, held-job reasons.
- [x] Add decision/report tests and commit locally.

## Task 3 — Candidate premium perks
- [x] Enforce premium subscription server-side for builder, badges and ranking.
- [x] Add upgrade/perk display and ensure expiry removes perks.
- [x] Verify Razorpay candidate and employer owner activation in tests.
- [x] Commit locally.

## Task 4 — Admin subscription activation
- [x] Inline billing form errors and owner-type plan/period filtering.
- [x] Audit and repair other admin validation form error handling.
- [x] Add action tests and commit locally.

## Task 5 — Legal pages
- [x] Update data-driven default legal policies and settings contact rendering.
- [x] Add jurisdiction setting, updated date, pricing/checkout legal links.
- [x] Commit locally.

## Task 6 — Small fixes and final gates
- [x] Email logo URL, admin settings controls, first-run checklist cleanup.
- [x] Update ASSUMPTIONS.md, KNOWN_ISSUES.md and TESTING.md.
- [x] Run typecheck, lint, build and all tests; note DB-backed coverage limits.
- [x] Commit locally.
