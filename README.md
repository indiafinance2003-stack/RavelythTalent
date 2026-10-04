# Ravelyth Talent

**Connecting Great People with Great Opportunities** — Right People, Better Opportunities, Stronger Tomorrow.

A professional recruitment and job portal. Next.js App Router, TypeScript, Tailwind, Zod, Vitest.

- Public job board with SQL-side filtering by keyword, location, experience, salary, employment type, work mode and skills
- Candidate portal: profile, resume upload and management, structured resume builder, saved jobs, job alerts, applications, interviews, notifications and Premium
- Employer portal: company and recruiter profiles, job credits and posting limits, job creation, candidate management, shortlisting, interviews, invoices and reports
- Recruitment-agency workflow: agency authorisation, client companies, agency submissions and placements
- Admin console: moderation of jobs and companies, users, packages, payments, premium plans, reports, audit log and platform settings
- Purpose-specific, withdrawable candidate consent and an audit trail for every decision

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The job board renders immediately; PostgreSQL is required for accounts and applications.

### PostgreSQL (accounts, sessions, jobs, applications)

1. Run a PostgreSQL 14+ server locally (any method; e.g. `docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16`).
2. In `.env.local` set:
   ```
   DATABASE_URL=postgresql://user:pass@localhost:5432/ravelyth
   ```
3. Create the schema from the committed SQL migrations:
   ```
   npm run db:migrate
   ```
   (Or regenerate after editing `src/lib/db/schema.ts` with `npm run db:generate`.)
4. Restart `npm run dev`. Register at /register.

Without `DATABASE_URL`, the app builds and all public pages/APIs work; account endpoints respond 503 with a clear message.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Vitest (database integration tests auto-skip without `TEST_DATABASE_URL`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |

## API

All JSON responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message" } }`.

| Method | Path |
| --- | --- |
| GET | `/api/health` |
| GET, POST | `/api/portal/jobs` |
| GET | `/api/portal/jobs/[id]` |
| POST | `/api/portal/auth/register` |
| POST | `/api/portal/auth/login` |
| POST | `/api/portal/auth/logout` |
| GET | `/api/portal/auth/me` |
| POST | `/api/portal/candidate/applications` |
| GET | `/api/portal/employer/applications` |
| POST | `/api/portal/payments/confirm` |
| GET | `/api/talent/jobs` |
| POST | `/api/talent/apply` |

See `docs/RAVELYTH_TALENT_API.md` for the full portal API reference.

## Security notes

- Passwords are hashed with Argon2id; never stored or logged in plaintext
- Sessions are server-side: random 256-bit tokens in HttpOnly SameSite=Lax cookies (Secure in production), only SHA-256 hashes stored, 7-day expiry enforced in the database
- All database access is parameterized through Drizzle and server-side only
- Identity always comes from the HttpOnly session cookie; roles are re-read from the database on every request
- Candidate consent is purpose-specific and withdrawable; resumes stay private until the candidate applies
- Rate limiting applies to public endpoints, with stricter per-account limits on login (per IP + email) and registration
- Security headers (CSP, X-Frame-Options DENY, nosniff, referrer policy) are set on every response
- Request size and rate limits are enforced on every endpoint
- In-memory rate limiting is suitable for a single instance; use an external store for multiple instances

See `.env.example` for configuration.
