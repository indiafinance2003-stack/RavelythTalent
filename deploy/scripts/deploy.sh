#!/usr/bin/env bash
# =============================================================================
# Ravelyth Talent - deployment script
#
#   sudo /var/www/ravelyth/deploy/scripts/deploy.sh
#
# Pulls the latest commit, installs dependencies, applies migrations, rebuilds
# and restarts the service. Every step is fail-fast.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ravelyth}"
SERVICE="${SERVICE:-ravelyth}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

cd "$APP_DIR"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

step "Preflight"
[ -f .env ] || fail ".env not found in $APP_DIR. Create it from .env.example."
[ -f package.json ] || fail "package.json not found - is this the app directory?"

step "Pull latest code (branch $BRANCH)"
git fetch --all --tags
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH" || fail "git pull failed (local changes?)"

step "Install dependencies"
npm ci --omit=dev || fail "npm ci failed"

step "Apply database migrations"
# Migrations are committed SQL in ./drizzle and are idempotent.
npm run db:migrate || fail "database migration failed - check DATABASE_URL and pg_trgm"

step "Seed reference data (idempotent)"
# Never creates users, companies or jobs - only plans, categories and settings.
npm run seed || fail "reference seed failed"

step "Build"
NODE_ENV=production npm run build || fail "next build failed"

step "Restart $SERVICE"
systemctl restart "$SERVICE" || fail "could not restart $SERVICE"

step "Health check"
sleep 5
for attempt in 1 2 3 4 5 6; do
    if curl --fail --silent --max-time 10 "$HEALTH_URL" >/dev/null; then
        printf '\n\033[1;32mDeployment complete and healthy.\033[0m\n'
        exit 0
    fi
    printf '  attempt %s/6 not healthy yet, retrying in 5s...\n' "$attempt"
    sleep 5
done

fail "Health check never passed. Inspect: journalctl -u $SERVICE -n 100 --no-pager"
