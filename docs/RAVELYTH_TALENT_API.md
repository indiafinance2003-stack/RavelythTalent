# Ravelyth Talent — Backend API (Part 1)

This document is the contract the Part 2 frontend builds against.

Base path: `/api/portal`

## Response envelope

Every JSON endpoint returns one of:

```json
{ "success": true, "data": ... }
```

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

`code` is a stable machine-readable string. `message` is safe to show to a user:
internal details, stack traces, SQL and secrets are never included.

Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `APPROVAL_REQUIRED` (409),
`EMAIL_NOT_VERIFIED` (403), `INSUFFICIENT_CREDITS` (402),
`PAYMENT_NOT_CONFIGURED` (503), `VERIFICATION_INVALID` (400),
`RATE_LIMIT_EXCEEDED` (429), `SERVICE_UNAVAILABLE` (503).

## Authentication

Session cookie `ravelyth_session` (HttpOnly, SameSite=Lax, Secure in production).
Identity is always derived from this cookie server-side. There is no endpoint
that accepts a user id, role or company id as authoritative.

A suspended account (`accountStatus = "suspended"`) is refused with `FORBIDDEN`
on every authenticated call, and its existing sessions stop resolving.

## Roles

| Role | Meaning |
| --- | --- |
| `candidate` | Job seeker |
| `employer` | Company user on Ravelyth Talent |
| `admin` | Platform administrator |
| `staff`, `owner` | Pre-existing admin roles, treated as administrators |
| `customer` | Pre-existing DNS-tools account, not a portal role |

## Public endpoints

### `GET /api/portal/jobs`
Job search. **All filtering happens in SQL**; the handler only validates input.

| Parameter | Notes |
| --- | --- |
| `keyword` | Matches title, description, location, skills and company name |
| `title` | Title substring |
| `companyId`, `companyName` | Company filter |
| `location` | Location substring |
| `experienceMin`, `experienceMax` | Years; matches overlapping bands |
| `salaryMin` | Minor units (paise); matches when the job's upper bound reaches it |
| `employmentType` | `full_time`, `part_time`, `contract`, `internship`, `freelance` |
| `workMode` | `onsite`, `hybrid`, `remote` |
| `skills` | Comma separated; **every** listed skill must be present |
| `industry` | Substring of the company industry |
| `postedWithinDays` | Published within N days |
| `page` (default 1), `pageSize` (default 20, max 50) | Pagination |
| `sort` | `recent`, `oldest`, `salary_desc`, `salary_asc`, `title` |
| `facets=1` | Returns filter facets instead of results |

Returns `{ items, total, page, pageSize, totalPages, hasMore }`.

Only `published` jobs are ever returned. A confidential salary band is returned
as `null` unless the employer set `salaryPublic`.

### `GET /api/portal/jobs/[id]`
One published job. Draft, pending, closed, expired and rejected jobs all return
`404`, so a draft cannot be probed by id.

## Authentication endpoints

### `POST /api/portal/auth/register`
```json
{ "name": "...", "email": "...", "password": "...",
  "confirmPassword": "...", "accountType": "candidate" | "employer",
  "company": { "name": "..." } }
```
Creates the account, opens a session, queues the verification email and records
`account_creation` consent. `accountType` is the ONLY accepted role source: a
client cannot register as `admin`. An employer **must** supply a company, which
is created with `verificationStatus = "pending"` — never auto-verified.

Returns `201` with `{ user, verification: { requested, emailDelivered } }`.
`emailDelivered` is `false` when no mail provider is configured; do not tell the
user the email was sent unless it is `true`.

### `POST /api/portal/auth/login`
`{ "email", "password" }` → `{ user }`. Rate limited per client **and** per email.
Unknown email and wrong password return the identical message, so the endpoint
cannot enumerate accounts. Five failures lock the account for 15 minutes.

### `POST /api/portal/auth/verify-email`
`{ "token" }`. Single use, expires after 24 hours. Unknown, expired and
already-used tokens all return the same generic error.

### `POST /api/portal/auth/resend-verification`
`{ "email" }`. Issues a new link and **invalidates every previous unused
token**. The response is non-committal so it cannot enumerate accounts.

### `GET /api/portal/auth/me`
`{ user: null }` when signed out (this is a 200, not an error). When signed in,
includes `role`, `emailVerified`, and for candidates `candidateProfile`,
`profileCompletion`, `subscription` and `entitlements`.

### `POST /api/portal/auth/logout`
Destroys the server-side session and clears the cookie.

## Candidate endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/portal/candidate/profile` | Own profile + completion |
| `PUT` | `/api/portal/candidate/profile` | Update; completion is recomputed server-side |
| `GET` | `/api/portal/candidate/resumes` | Own resumes + available templates |
| `POST` | `/api/portal/candidate/resumes` | Create a resume container |
| `PATCH` | `/api/portal/candidate/resumes` | `{ resumeId, isDefault: true }` |
| `GET` | `/api/portal/candidate/applications` | Own applications |
| `POST` | `/api/portal/candidate/applications` | Apply (requires verified email + consent) |
| `GET` | `/api/portal/candidate/saved-jobs` | Own saved jobs |
| `POST` | `/api/portal/candidate/saved-jobs` | Save (idempotent) |
| `DELETE` | `/api/portal/candidate/saved-jobs?jobId=` | Unsave |
| `GET` | `/api/portal/candidate/alerts` | Own job alerts |

Applying returns `201` with `{ application }`. Errors are explicit:
`409` for a duplicate, for a closed job, or after the deadline.

**Resume files are never served by these routes.** A download must go through the
authorized read endpoint, which records an access log entry.

## Employer endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/portal/employer/company` | Own company |
| `PUT` | `/api/portal/employer/company` | Update; cannot change verification status |
| `GET` | `/api/portal/employer/jobs` | Company jobs + credit balance |
| `POST` | `/api/portal/employer/jobs` | Create a **draft** |
| `PUT` | `/api/portal/employer/jobs?jobId=` | Submit for approval |
| `GET` | `/api/portal/employer/applications` | Applications to this company only |
| `GET` | `/api/portal/employer/credits` | Balance, ledger and package catalogue |
| `GET` | `/api/portal/employer/orders` | Company orders |
| `POST` | `/api/portal/employer/orders` | Start a purchase |

**An employer can never publish a job.** `POST` creates a draft and `PUT`
submits it for review; the status is decided server-side. When approval is
required (the default) the result is `pending_approval`. A job credit is consumed
at submission and returned if the employer withdraws before approval.

If the company has no credits, submission returns `402 INSUFFICIENT_CREDITS`.

### `POST /api/portal/employer/orders`
```json
{ "packageId": "<uuid>", "nonRefundableAccepted": true }
```
**There is no amount field.** The price is read from the package row server-side.
A client claiming a payment succeeded changes nothing — only a verified webhook
or a server-side signature check can mark an order paid. Returns
`503 PAYMENT_NOT_CONFIGURED` when no gateway is configured, rather than
pretending a checkout exists.

## Admin endpoints

Every admin route calls `requireAdminUser()` before doing any work, so a
candidate or employer receives `403` and never learns whether an id exists.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/portal/admin/stats` | Dashboard figures and 30-day series |
| `GET` | `/api/portal/admin/jobs` | Review queue (filter by `status`) |
| `PUT` | `/api/portal/admin/jobs?jobId=` | `{ decision: "approve" \| "reject", reason }` |
| `GET` | `/api/portal/admin/users` | Paginated user list |
| `GET` | `/api/portal/admin/companies` | Company verification queue |
| `PUT` | `/api/portal/admin/companies/[id]` | Verification decision |
| `GET` | `/api/portal/admin/packages` | Job packages |
| `POST`/`PUT` | `/api/portal/admin/packages` | Create / update pricing |
| `GET` | `/api/portal/admin/reports` | Moderation queue |
| `GET` | `/api/portal/admin/audit` | Audit trail |

Rejecting a job **requires** a reason (`400` without one). Changing a role cannot
assign `admin`, `owner` or `staff` — there is no escalation path.

## Webhook

### `POST /api/portal/payments/webhook`
Configure this exact URL in the gateway dashboard.

1. The raw body is verified against the webhook secret **before** parsing.
   A bad signature returns `400` and nothing is read.
2. The event id is claimed under a unique index. A replay returns `200` with
   `{ duplicate: true }` and performs **no** side effects.
3. The order is located by the provider's own order id; the credited amount
   comes from the stored order.
4. Marking paid and granting credits are atomic and idempotent.

## Frontend contracts

- **Money** is always integer **minor units** (paise). Format for display only.
- **Dates** are ISO 8601 strings.
- **Pagination** returns `{ items, total, page, pageSize, totalPages, hasMore }`.
- **`salaryPublic: false`** means render no salary, not a placeholder.
- **Job status values:** `draft`, `pending_approval`, `published`, `closed`,
  `expired`, `rejected`.
- **Application status values:** `applied`, `shortlisted`, `interview`,
  `selected`, `rejected`, `hired`.
- When `emailDelivered` is `false`, show a "resend verification" affordance
  rather than claiming the email was sent.
- Branding is configurable; do not hard-code it in components.
