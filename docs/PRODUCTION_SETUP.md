# Production setup (manual, operator-owned steps)

This document covers the deployment tasks that cannot be automated or proven by
code, so they are owned by whoever operates the deployment. Nothing here is
performed by the application itself; every value is a placeholder and must be
filled in by the operator. The application never fabricates success — if a
configuration below is missing, the relevant feature reports "not configured /
unavailable" instead of a fake success.

## 1. Environment

1. Copy `.env.example` to `.env` (or the platform's secret store).
2. Set `NODE_ENV=production` and `APP_URL` to the public HTTPS origin (used for
   canonical URLs, redirects, and the robots sitemap link).
3. Set `DATABASE_URL` to the production PostgreSQL connection string.
4. After configuring the database, apply migrations:

   ```bash
   npm run db:migrate
   ```

   Migrations are sequential and non-destructive (no DROP TABLE / TRUNCATE /
   DELETE). KB content seeds itself idempotently on first read; no manual seed
   step exists.

## 2. Reverse proxy and trusted headers

`TRUST_PROXY_HEADERS` defaults to `true` in production, which is correct only
when the app is reachable exclusively through a reverse proxy (e.g. nginx,
Cloudflare) that sets `X-Forwarded-For` / `X-Real-IP`. When it is `true`, those
headers are used as the client identity for rate limiting and abuse fingerprint
storage. If the app is exposed directly, set `TRUST_PROXY_HEADERS=false`.

## 3. Owner account

Set `OWNER_EMAIL` to the email of the single account that should be promoted to
the owner role at sign-in (owner bootstrap). Leave it empty in shared or
multi-tenant deployments. The account signs in normally and is then treated as
owner.

## 4. Payments (Razorpay)

Checkout is deliberately refused until every credential below is present. Do not
advertise checkout before this section is complete.

1. Set `BILLING_PROVIDER=razorpay`.
2. Set the three credentials (all required; checkout refuses to start if any is
   missing):
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET` (used to create orders and verify the payment
     signature `HMAC-SHA256(orderId|paymentId)`)
   - `RAZORPAY_WEBHOOK_SECRET` (used to verify the webhook signature over the raw
     body)
3. Prices are not read from the environment for Ravelyth Talent. Recruiter plans
   live in the `recruiter_plans` tables and candidate Premium plans in
   `candidate_premium_plans`; edit them in the database (or seed them) so the
   public pricing page, checkout and invoices all read one source of truth.
4. In the Razorpay dashboard, register a webhook on the checkout environment
   pointing at:

   ```
   https://<APP_URL>/api/portal/payments/webhook
   ```

   with **exactly** these events: `payment.captured`, `payment.failed`,
   `order.paid`, `refund.processed`. Paste the webhook secret into
   `RAZORPAY_WEBHOOK_SECRET`. Other events are acknowledged but ignored.

### 4.1 What the webhook does

- `payment.captured` / `order.paid` → marks the checkout session paid and
  activates the subscription + paid invoice in one transaction. Idempotent:
  the session is claimed with a pending-only conditional update, so out-of-order
  or duplicate deliveries cannot double-activate or double-invoice.
- `payment.failed` → marks the session `failed` (pending-only).
- `refund.processed` → marks the order `refunded` and switches the
  subscription to `canceled`. Redeliveries are no-ops.
- A webhook whose order/payment id matches no order is acknowledged and logged;
  the operator should investigate logs if it was not spurious.

### 4.2 Required manual test checklist (test-mode credentials first)

1. Start a checkout and verify an order is created with the exact quoted amount.
2. Complete a payment and verify the session becomes `paid`, the subscription is
   `active`, and a `paid` invoice exists. Duplicate the webhook delivery and
   confirm nothing is doubled.
3. Complete a payment with a tampered signature and confirm the verify endpoint
   rejects it.
4. Simulate `payment.failed` and confirm the session becomes `failed` and no
   subscription is activated.
5. Process a refund and confirm the session becomes `refunded` and the
   subscription `canceled` (support entitlement turns off).
6. With `BILLING_PROVIDER` empty, confirm the UI shows "billing integration
   pending" and checkout is refused.

### 4.3 Monitoring note

The application does not run automated reconciliation, dunning, or card
recovery. The operator should monitor the payment provider dashboard and revoke
entitlement explicitly when a subscription is cancelled or a payment is
reversed.

## 5. Transactional email

`EMAIL_PROVIDER` is empty by default, and no email delivery is claimed anywhere
until a provider is configured and `EMAIL_FROM` is set. Customer notifications
are in-app records only.

## 6. Ravelyth Talent

- `TALENT_STORAGE_DIR` defaults beside the application
  (`.ravelyth-private/talent-documents`). It must sit **outside** `/public` and
  outside version control, and the server process must have write permission.
  Candidate documents are never served from static paths — a private,
  authorised server route reads them.
- `TALENT_MAX_RESUME_BYTES` bounds upload size (default 5 MiB).
- Public (unauthenticated) applications are throttled per client identity via
  `TALENT_APPLICATION_RATE_LIMIT_MAX` / `TALENT_APPLICATION_RATE_LIMIT_WINDOW_MS`.

## 7. Runbook minimal checklist before launch

- [ ] `DATABASE_URL` set and `npm run db:migrate` applied.
- [ ] `APP_URL` correct; `TRUST_PROXY_HEADERS` matches the proxy arrangement.
- [ ] `OWNER_EMAIL` set for the operator account.
- [ ] Recruiter plans and candidate Premium plans seeded in the database.
- [ ] Razorpay key credentials + webhook secret present and webhook events
      registered with the exact event list above.
- [ ] Test checklist in 4.2 passed in test mode, then switch to live mode.
- [ ] `TALENT_STORAGE_DIR` outside `/public`, writable, and secured.