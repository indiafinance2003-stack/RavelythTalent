# Manual owner actions

These tasks require owner credentials, infrastructure, or product decisions and
cannot be completed or truthfully verified in this development environment.

1. **Recover the local database administrator access.** PostgreSQL 17 is
   running on port 5432, but the local `postgres` password was changed during
   an unsuccessful bootstrap and its generated value was not retained. Use an
   authorized local administrator recovery path; do not enable trust
   authentication.
2. **Initialize the local runtime.** Create database `ravelyth` and role
   `ravelyth_app`, copy `.env.example` to a gitignored `.env`, set a unique
   development `DATABASE_URL`, `SESSION_SECRET` (32+ random characters),
   `CRON_SECRET`, `UPLOAD_DIR`, and Mailpit values (`SMTP_HOST=127.0.0.1`,
   `SMTP_PORT=1025`). Then run `npm run db:migrate`, `npm run seed`,
   `npm run seed:admin`, and `npm run seed:demo`; verify `/api/health`.
3. **Run the missing integration tests.** Exercise registration and
   verification, approval and job posting, search, applications and
   applicant management, ownership/role restrictions, quotas, offline/online
   billing, webhooks, email outbox, cron, resume builder, blog, reviews, and
   salary insights against a disposable local or staging database. Do not use
   production customer data.
4. **Configure production services.** Supply production SMTP credentials and
   deliverability DNS; add Razorpay keys plus webhook secret and registered
   events; configure Google OAuth only if desired. A real SMS adapter is not
   implemented—do not enable OTP SMS until one is added and tested.
5. **Complete real-world company/brand setup.** Add the approved `public/logo.svg`
   if available; enter the legal name, address, support email, phone, GSTIN,
   and GST rate under Admin → Settings. Configure the real support contact.
6. **Prepare production hosting.** Set production-only secrets and `APP_URL`,
   follow `deploy/DEPLOYMENT.md`, install and enable Nginx/systemd services,
   validate the internal cron block from an external client, configure
   encrypted off-site uploads backups, and test database and uploads restores.
7. **Perform launch acceptance.** Run `npm run typecheck`, `npm run lint`,
   `npm run build`, `npm run test`, and `npm run test:e2e` with the configured
   database; review desktop/tablet/mobile layouts, accessibility, email
   delivery, payment sandbox, and production logs before accepting live users.
