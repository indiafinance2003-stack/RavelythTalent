# Known issues

## Blocked or incomplete

- **MEDIUM — conversion needs database-backed verification:** Task 1 adds
  candidate/employer conversion and switch-back policy tests, but PostgreSQL
  authentication remains unavailable, so the transaction, session rotation,
  company creation, and queued confirmation email still need staging
  verification. Additive migration `0008_flimsy_black_tarantula.sql` has not
  been applied locally.
- **MEDIUM — job-alert flow needs provider/database verification:** Task 2
  tests matching, consent, India-day delivery caps and unsubscribe policy as
  pure logic. Registration-to-alert persistence, publish-hook notifications,
  concurrent outbox suppression and SMTP delivery still require staging
  verification. Additive migration `0009_flaky_colossus.sql` has not been
  applied locally.
- **MEDIUM — salary insight SQL not exercised against PostgreSQL:** Task 3 adds
  a generated-SQL regression check and retains the five-posting threshold, but
  application database authentication is unavailable. The query and empty
  state still need a staging/local PostgreSQL smoke test.
- **LOW — Indian date formatting has unit coverage only:** Task 4 tests the
  required UTC-to-Asia/Kolkata format and invalid/absent values. A browser
  walkthrough and visual inspection of real email/PDF output remain part of
  staging verification; the formatter itself does not require database access.
- **MEDIUM — password-reset email persistence needs database verification:**
  Task 5 policy tests cover all account roles and active/suspended/deactivated
  statuses, plus unverified, deleted and unknown addresses. The case-insensitive
  lookup, password token/outbox transaction, and suppressed-reason rendering
  still require a staging/local PostgreSQL smoke test because local database
  authentication is unavailable.
- **MEDIUM — account deletion needs database/filesystem walkthrough:** Task 6
  policy tests cover self/admin guards, paid-payment/invoice blocks and the
  owned-company deletion decision. PostgreSQL cascade/ownership-transfer
  behavior and successful/failed local-file cleanup need a staging test; local
  PostgreSQL authentication is unavailable.
- **BLOCKER — local PostgreSQL credentials:** PostgreSQL is installed and
  running, but application authentication to the local database fails. A prior
  bootstrap attempt changed the local `postgres` password before failing; its
  generated password was not retained. Do not enable trust authentication as a
  workaround. Migrations and seeds have not been applied to a local database.
- **HIGH — database-backed flows not exercised:** The unit suite has 82 passing
  tests across 14 Vitest files, including mocked Razorpay owner/activation
  coverage, but it does not replace DB-backed tests for free-post quota
  consumption, moderation/report persistence, offline billing transactions,
  invoices, or the admin search flow. Those require a working local/staging
  PostgreSQL database.
- **MEDIUM — live providers not configured:** Razorpay checkout/webhooks,
  production SMTP and a real SMS provider have not been exercised against live
  services. Razorpay SDK order creation is mocked in unit tests.
- **MEDIUM — deployment validation:** Nginx, systemd and shell validation
  tools were unavailable on Windows. Deployment, backup/restore and restart
  behavior still need validation on the target Ubuntu host.
- **MEDIUM — browser verification:** No authenticated browser walkthrough
  against a working database was possible. Use the manual scenarios in
  `TESTING.md` on staging before launch.
- **HIGH — development dependency advisories:** Five high-severity npm audit
  findings remain in the ESLint/Next lint dependency chain; production
  dependencies previously reported zero vulnerabilities. See
  `SECURITY_NOTES.md`.

Do not treat this application as launch-ready until database access, owner
configuration, staging walkthroughs and the outstanding actions in
`MANUAL_TODO.md` are completed.
