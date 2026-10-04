# Known issues

## Blocked or incomplete

- **BLOCKER — local PostgreSQL credentials:** The PostgreSQL service runs, but
  app authentication fails. A bootstrap attempt changed the local `postgres`
  password before failing, and its generated password was not retained.
  Database creation, migrations, seeds, and all DB-backed tests remain
  unverified. Recover/reset the local administrator credential before
  continuing; do not enable trust authentication as a workaround.
- **HIGH — incomplete integration coverage:** The 45 passing unit tests and
  two passing browser smoke tests do not cover the requested core user
  journeys, authorization matrix, payment webhooks, cron jobs, or
  subscription/quota behavior. The DB-backed Playwright health check fails on
  the local authentication issue.
- **HIGH — development dependency advisories:** Five high-severity npm audit
  findings remain in the ESLint/Next lint dependency chain. Production
  dependencies report zero vulnerabilities. See `SECURITY_NOTES.md`.
- **MEDIUM — provider setup:** No real SMS provider adapter is configured.
  Google OAuth, Razorpay and production SMTP are unconfigured. The UI guards
  unsupported/missing providers, but external provider flows have not been
  runtime-tested.
- **MEDIUM — deployment validation:** Nginx, systemd, and shell validation
  tools were unavailable on Windows. The backup and deployment files need
  validation on the target Ubuntu host. The backup service was changed to run
  as the unprivileged `ravelyth` account after review found it had been running
  as root while sourcing the app environment.
- **MEDIUM — production and UX checks:** Production `npm run start`, real
  email delivery, responsive page review, accessibility review, and
  database-backed sitemap/robots checks were not performed.

Do not treat this application as launch-ready until the blocker and owner
actions in `MANUAL_TODO.md` are completed and the flows in `TESTING.md` are
verified in a usable staging environment.
