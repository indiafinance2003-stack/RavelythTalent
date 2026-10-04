# Runtime and launch-hardening progress

This checklist tracks the hands-on runtime and launch-readiness work requested
after implementation phases 1-7. Update each item with evidence/results, and
record blockers rather than representing an unrun test as passing.

## Step 1 — Local runtime
- [x] Rename `MASTER_PROMPT.md.txt` to `MASTER_PROMPT.md`; read the spec and the
      current `ASSUMPTIONS.md` / `PROGRESS.md`.
- [ ] Install/start local PostgreSQL and create `ravelyth` / `ravelyth_app` on
      `127.0.0.1:5432`. PostgreSQL 17 is installed and its service is running,
      but database/app-role access is blocked: a bootstrap attempt changed the
      local `postgres` password before failing, and the generated password was
      not retained. Recovery requires an elevated local administrator action.
- [ ] Create a development-only ignored `.env` and local upload directory.
- [ ] Configure local-only SMTP values. Mailpit is installed and its SMTP
      listener (127.0.0.1:1025) and UI (127.0.0.1:8025) are responding.
- [ ] Run migrations, reference seed, admin seed, and development demo seed.
      `npm run db:migrate` was attempted and stopped before connecting because
      no verified `DATABASE_URL` is available; seeds were not attempted.
- [ ] Verify DB health, PostgreSQL extensions, generated search vectors, and
      invoice numbering sequence.
- [ ] Run app in dev mode and verify `/api/health`.

## Step 2 — Automated tests
- [x] Add `npm run test` and `npm run test:e2e` using Vitest and Playwright.
- [ ] Add coverage for all requested unit, API, authorization, and browser
      flows. Current coverage is focused unit tests and three public smoke
      checks, not the full requested flow matrix.
- [x] Fix application defects found by checks; the missing `zod` import was
      corrected and the failing database health assertion remains intact.

Latest recorded test results: 45 Vitest tests passed; Playwright had 2 smoke
checks pass and the database health check fail because the app cannot
authenticate to the unavailable local database. Full DB-backed verification
has not run.

## Step 3 — Launch-critical gaps
- [x] Gracefully gate payment, Google OAuth, and SMS features when unconfigured.
- [x] Add audited offline/manual subscription activation for admins.
- [x] Deny `/api/internal/` at Nginx and enforce loopback without trusting
      forwarded client headers.
- [x] Exclude private routes from robots and add sitemap publication filters;
      live sitemap verification remains blocked on the app/database.
- [x] Add admin first-run setup checklist.
- [x] Add rotating database backup script/timer and uploads backup guidance.

## Step 4 — Security and dependencies
- [x] Run `npm audit`; production dependencies have no reported advisories.
      Five high-severity development-tooling advisories remain after compatible
      fixes; see pending `SECURITY_NOTES.md`.
- [x] Complete bounded static review of every Route Handler and Server Action
      for auth, ownership,
      entitlements, validation, CSRF, and rate limiting.
- [ ] Runtime-verify file route authorization/path safety, headers/cookies, client bundle
      secret absence, and production error responses. Client static bundles
      contain none of `RAZORPAY_KEY_SECRET`, `SMTP_PASS`, or `SESSION_SECRET`;
      production health failure returned generic JSON. Full route audit is
      limited to static inspection where DB/provider-dependent checks were
      unavailable.

## Step 5 — UX and production quality
- [ ] Walk pages at 375px, tablet, and desktop; fix responsive/accessibility gaps.
- [ ] Verify logo fallback/replacement, metadata/canonical URLs, and loading/empty/
      error states.
- [ ] Run production build and `npm run start` against the local database.

## Step 6 — Deployment files
- [ ] Validate Nginx/systemd/shell scripts and fresh-install/update runbooks.
      Manual review was possible; native Nginx/systemd checks were unavailable.
      `bash -n` could not run because the installed `bash` command launches WSL
      and there is no WSL distribution.
- [x] Add owner-friendly `LAUNCH_CHECKLIST.md`.

## Step 7 — Final documentation and report
- [x] Add `TESTING.md`, `KNOWN_ISSUES.md`, `MANUAL_TODO.md`,
      `SECURITY_NOTES.md`, and `LAUNCH_CHECKLIST.md`.
- [x] Run final typecheck, lint, build, unit/API tests, and E2E tests. Typecheck,
      lint, build, and 45 unit tests pass; E2E has 2 passing public smoke tests
      and 1 failing DB health check because local credentials are unavailable.
- [ ] Commit completed work locally; never push.

## Current environment
- Windows; Node 24.19.0 and npm 11.17.0.
- PostgreSQL 17 service is running on port 5432; Docker/Podman were not
  available. The app database, migrations, and seeds have not been verified.
- Mailpit is listening locally on ports 1025 and 8025. No app `.env` has been
  created because database credentials are not verified.
