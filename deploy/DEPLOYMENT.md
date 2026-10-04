# DEPLOYMENT.md — Ravelyth Talent

Target: **Ubuntu 24.04 LTS**, single VPS, app on `127.0.0.1:3000`, nginx in
front, HTTPS for `ravelyth.in` (and `www` redirected to the apex).

```
App dir      /var/www/ravelyth
Service user ravelyth (non-root)
Upload dir   /var/lib/ravelyth/uploads
PostgreSQL   127.0.0.1:5432, database "ravelyth", role "ravelyth_app"
Node         >= 20 (tested on Node 22/24)
```

---

## 1. Base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx postgresql postgresql-contrib \
  ca-certificates gnupg certbot python3-certbot-nginx rsync ufw fail2ban

# Node 20+ (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # must be >= v20
```

## 2. Create the service user and directories

```bash
sudo adduser --system --group --home /var/www/ravelyth ravelyth
sudo mkdir -p /var/www/ravelyth /var/lib/ravelyth/uploads /var/www/certbot
sudo chown -R ravelyth:ravelyth /var/www/ravelyth /var/lib/ravelyth
sudo chmod 750 /var/lib/ravelyth /var/lib/ravelyth/uploads
sudo chmod 640 /var/www/ravelyth/.env     # after the file exists
```

## 3. Database

```bash
# 1. Edit deploy/postgres/setup.sql and set a strong password, then:
sudo -u postgres psql -f /var/www/ravelyth/deploy/postgres/setup.sql

# 2. Confirm it works with the app's credentials:
psql "postgresql://ravelyth_app:<PASSWORD>@127.0.0.1:5432/ravelyth" -c "select 1;"
```

The script creates the role, the database, the `pg_trgm` / `unaccent`
extensions and applies least-privilege grants. The password you set here must
match `DATABASE_URL` in `.env`.

## 4. Application code and environment

```bash
cd /var/www/ravelyth
# (git clone into this directory, or copy your working tree here)

cp .env.example .env
chmod 640 .env
```

Fill in at minimum:

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://ravelyth.in` |
| `DATABASE_URL` | `postgresql://ravelyth_app:<PASSWORD>@127.0.0.1:5432/ravelyth` |
| `SESSION_SECRET` | `openssl rand -hex 48` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | used by `npm run seed:admin` |
| `UPLOAD_DIR` | `/var/lib/ravelyth/uploads` |
| `SMTP_*`, `EMAIL_FROM` | SMTP credentials |
| `SUPPORT_EMAIL` | Receives public contact-form messages; site settings can also supply it |
| `RAZORPAY_*`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay keys |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `SMS_PROVIDER` + provider credentials | keep `console` until a real provider is wired |

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CRON_SECRET
```

## 5. Install, migrate, seed, build

```bash
cd /var/www/ravelyth
sudo -u ravelyth npm ci --include=dev
sudo -u ravelyth npm run db:migrate
sudo -u ravelyth npm run seed        # plans, categories, skills, add-ons, settings
sudo -u ravelyth npm run seed:admin  # idempotent, uses ADMIN_* env vars
sudo -u ravelyth npm run build
```

`npm run seed:demo` is **refused** when `NODE_ENV=production`.

## 6. systemd: application + cron timers

```bash
sudo cp deploy/systemd/ravelyth.service /etc/systemd/system/
sudo cp deploy/systemd/ravelyth-cron-*.service /etc/systemd/system/
sudo cp deploy/systemd/ravelyth-cron-*.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ravelyth

sudo systemctl enable --now ravelyth-cron-process-email-outbox.timer
sudo systemctl enable --now ravelyth-cron-send-job-alerts.timer
sudo systemctl enable --now ravelyth-cron-subscription-expiry-and-reminders.timer
sudo systemctl enable --now ravelyth-cron-expire-jobs.timer
sudo systemctl enable --now ravelyth-cron-cleanup-expired-tokens-sessions.timer

systemctl list-timers 'ravelyth-cron-*'
```

Each timer calls `http://127.0.0.1:3000/api/internal/cron/<job>` with the
`x-cron-secret` header read from `/var/www/ravelyth/.env`. The endpoint also
rejects any caller that is not loopback.

Manual trigger for a smoke test:

```bash
sudo -u ravelyth bash -c 'set -a; . /var/www/ravelyth/.env; set +a; \
  curl -sS -H "x-cron-secret: $CRON_SECRET" \
  http://127.0.0.1:3000/api/internal/cron/process-email-outbox'
```

## 7. nginx and HTTPS

```bash
sudo cp deploy/nginx/ravelyth.in.conf /etc/nginx/sites-available/ravelyth.in
sudo ln -s /etc/nginx/sites-available/ravelyth.in /etc/nginx/sites-enabled/

# First run only: bootstrap a certificate so the TLS server block is valid.
sudo systemctl stop nginx
sudo certbot certonly --standalone -d ravelyth.in -d www.ravelyth.in \
  --agree-tos -m you@example.com --non-interactive
sudo systemctl start nginx

sudo nginx -t && sudo systemctl reload nginx

# Later renewals (the timers are installed by the certbot package).
sudo certbot renew --dry-run
```

## 8. Third-party configuration (owner actions)

### Razorpay
1. Create live keys; set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
2. Add a webhook: **URL** `https://ravelyth.in/api/webhooks/razorpay`,
   **events** `payment.captured`, `payment.failed`, `order.paid`,
   **secret** -> set as `RAZORPAY_WEBHOOK_SECRET`.
3. Use the same secret value in both places.

### Google OAuth
1. Google Cloud Console -> APIs & Services -> Credentials -> OAuth client (Web).
2. Authorised redirect URI: `https://ravelyth.in/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### SMTP
Set `SMTP_HOST=mail.ravelyth.in`, `SMTP_PORT=587`, `SMTP_SECURE=false`,
`SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. STARTTLS is enforced in code.
Then use **Admin -> Emails -> Send test email** to verify deliverability, and
add SPF / DKIM / DMARC DNS records for `ravelyth.in`.

### SMS
Keep `SMS_PROVIDER=console` until a real provider is implemented in
`src/lib/sms/providers/`. See `ASSUMPTIONS.md`.

### Brand + legal
- Drop the approved logo at `public/logo.svg` (favicon and OG image already
  point at it; a text wordmark is used until then).
- Fill legal name, address, phone, email, GSTIN and social links in
  **Admin -> Settings** before going live. Nothing is invented by default.

## 9. Backups

```bash
sudo install -m 0755 -o root -g root /dev/null /etc/cron.daily/ravelyth-backup
sudo tee /etc/cron.daily/ravelyth-backup >/dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
DEST=/var/backups/ravelyth
mkdir -p "$DEST"
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$DEST/ravelyth-$(date +%F).dump"
tar -czf "$DEST/uploads-$(date +%F).tar.gz" -C /var/lib/ravelyth uploads
find "$DEST" -type f -mtime +14 -delete
EOF
sudo chmod 0755 /etc/cron.daily/ravelyth-backup
```

For encrypted off-site backups, add restic/borg; keep the passphrase in
`/root/.config`.

## 10. Routine deploys

```bash
sudo /var/www/ravelyth/deploy/scripts/deploy.sh
```

It runs `git pull` -> `npm ci` -> `npm run db:migrate` -> `npm run seed` ->
`npm run build` -> `systemctl restart` -> health check, and aborts on the first
failure.

## 11. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo fail2ban-client status
```

## 12. Post-deploy smoke test

- [ ] `curl -s https://ravelyth.in/api/health` returns `"status":"ok"`.
- [ ] `https://ravelyth.in/` renders the hero, pillars and categories.
- [ ] `https://ravelyth.in/jobs?q=react` returns results (or a clean empty state).
- [ ] `https://ravelyth.in/robots.txt` and `/sitemap.xml` return 200.
- [ ] Register a test account -> verification email arrives -> link works ->
      sign in succeeds.
- [ ] Sign in, upload a PDF resume, apply to a job, see it in
      `/dashboard/applications`.
- [ ] `https://ravelyth.in/verify-email` resend works.
- [ ] Admin sign-in works and the email test button delivers.
- [ ] Each cron endpoint returns `{"ok":true}` when called from localhost with
      the secret, and **403** without it.
- [ ] `https://www.ravelyth.in` 301s to the apex.
- [ ] `http://ravelyth.in` 301s to HTTPS.
- [ ] TLS: `https://www.ssllabs.com/ssltest/` or `openssl s_client`.
- [ ] Backups appear in `/var/backups/ravelyth`.
- [ ] `journalctl -u ravelyth -n 100 --no-pager` shows no errors.

## 13. Troubleshooting

```bash
sudo systemctl status ravelyth
sudo journalctl -u ravelyth -n 200 --no-pager
sudo journalctl -u ravelyth-cron-process-email-outbox -n 50 --no-pager
sudo nginx -t
tail -n 100 /var/log/nginx/ravelyth.error.log
sudo -u postgres psql -c "select count(*) from ravelyth.users;"
```

Common issues:
- **Env errors on boot** - `instrumentation.ts` fails fast with a precise list
  of missing/invalid variables; check `/var/www/ravelyth/.env`.
- **Emails not sending** - the outbox is retried with exponential backoff; a
  message in state `failed` after 6 attempts appears in **Admin -> Emails** and
  can be retried manually.
- **403 from cron** - the `CRON_SECRET` header does not match, or the caller
  is not loopback.
- **Uploads 404** - `UPLOAD_DIR` must be outside `/public` and owned by
  `ravelyth`.
