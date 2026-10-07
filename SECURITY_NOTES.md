# Security notes

## Dependency audit

`npm audit` reports five high-severity development-tooling findings:

| Package | Severity | Where used | Assessment |
| --- | --- | --- | --- |
| `eslint-config-next` | High | Direct development dependency | Audit's suggested fix downgrades to 14.2.35, a breaking major-version change incompatible with this Next.js 16 app; not applied. |
| `@next/eslint-plugin-next` | High | Transitive ESLint tooling | Only used by lint tooling, not in the production dependency tree. |
| `fast-glob` | High | Transitive under the ESLint plugin | Development/lint dependency path only. |
| `micromatch` | High | Transitive under `fast-glob` | Development/lint dependency path only. |
| `braces` | High | Transitive under `micromatch` | GHSA-vfj7-8cjw-p6xm describes stack exhaustion on deeply nested patterns; not exposed to requests handled by the production app in the reported dependency path. |

The compatible `npm audit fix` did not resolve the advisories; the suggested
forced fix downgrades the Next.js lint config across a major version. No
breaking fix was applied. Recheck the audit and update to compatible patched
Next.js/ESLint tooling releases. `npm audit --omit=dev --audit-level=low`
reports zero production dependency vulnerabilities.

## Checks performed

- `RAZORPAY_KEY_SECRET`, `SMTP_PASS`, and `SESSION_SECRET` were not found in
  `.next/static` client bundles.
- A production-mode smoke check returned a generic database-unavailable
  response without SQL, stack, or credential details. This used an
  intentionally invalid local database password; production behavior with a
  working database remains unverified.
- The internal cron public path is denied in Nginx configuration and the
  application no longer trusts `X-Forwarded-For` to identify the connecting
  client.
- **Fixed HIGH finding:** the backup service previously ran as root while
  sourcing the app user's writable `.env`. It now runs as the unprivileged
  `ravelyth` account and writes to a mode-0700 backup directory owned by that
  account. A modified environment file can no longer execute backup commands
  with root privileges.

The repository-wide static route/action review found no additional actionable
findings in its bounded pass. Database-backed authorization, ownership,
entitlement, and provider behavior still require runtime tests with a usable
database and provider credentials.

## Assistant area (Task 7)

- Inbox and Anthropic credentials are read from environment variables only
  (`src/lib/env.ts`, `.env.example`); nothing secret is stored in the
  database and account status payloads expose no credentials.
- All `/admin/assistant` pages and server actions require admin
  authorization plus the shared CSRF (same-origin) check, rate limiting and
  audit-log entries for sends, approvals, imports and deletions.
- Email content is treated as untrusted: messages render as plain text only,
  HTML is never stored or executed, attachments are names only, and the AI
  prompt delimits email text with explicit instructions never to follow
  instructions found inside emails.
- Campaign mail carries `List-Unsubscribe` / `List-Unsubscribe-Post` headers
  and the public unsubscribe endpoint accepts only HMAC-signed, expiring
  tokens and writes only to the suppression list.
- Cron endpoints `/api/internal/cron/sync-inbox` and
  `/api/internal/cron/process-campaigns` use the existing `CRON_SECRET`
  protection; the Nginx deny rule for `/api/internal/` covers them.

## Social auto-posting (Task 9)

- Meta credentials are read from environment variables only
  (`SOCIAL_FACEBOOK_PAGE_ID`, `SOCIAL_FACEBOOK_PAGE_TOKEN`,
  `SOCIAL_INSTAGRAM_USER_ID`, `SOCIAL_GRAPH_VERSION`). The database stores
  switches, caps and a token *error message* only; no access token is ever
  persisted, logged or returned to the browser.
- `/admin/social`, `/admin/social/settings` and `/admin/social/digest` and all
  their server actions require admin authorization, the shared same-origin
  (CSRF) check, rate limiting and audit-log entries for settings changes,
  retries, cancellations, manual posts and digest marking.
- Post text and the job-card image are built from public job fields only.
  Candidate data, employer private contact details and hidden salaries are
  never included; `/api/social/card/[jobId]` returns 404 for any job that is
  not currently published.
- The processor endpoint `/api/internal/cron/process-social-posts` uses the
  existing `CRON_SECRET` protection and is covered by the Nginx deny rule for
  `/api/internal/`.
- Graph API failures that indicate an expired or invalid token (HTTP 401/403
  or Graph error code 190) stop that platform's retries and raise an admin
  banner instead of silently hammering the API.
- No unofficial WhatsApp automation is used: the digest is generated for
  manual copy/paste and nothing is sent to a personal WhatsApp account.
