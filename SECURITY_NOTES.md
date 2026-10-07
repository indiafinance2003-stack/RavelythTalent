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
