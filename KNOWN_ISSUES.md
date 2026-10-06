# Known issues

## Blocked or incomplete

- **MEDIUM — conversion needs database-backed verification:** Task 1 adds
  candidate/employer conversion and switch-back policy tests, but PostgreSQL
  authentication remains unavailable, so the transaction, session rotation,
  company creation, and queued confirmation email still need staging
  verification. Additive migration `0008_flimsy_black_tarantula.sql` has not
  been applied locally.
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
