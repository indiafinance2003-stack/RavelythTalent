#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/var/www/ravelyth/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ravelyth}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read application environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is missing from $ENV_FILE" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"

date_tag="$(date +%F)"
destination="$BACKUP_DIR/ravelyth-$date_tag.dump"
temporary="$destination.tmp"
trap 'rm -f "$temporary"' EXIT

pg_dump --dbname="$DATABASE_URL" --format=custom --file="$temporary"
test -s "$temporary"
mv -f "$temporary" "$destination"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'ravelyth-*.dump' -mtime +13 -delete

printf 'Database backup written: %s\n' "$destination"
