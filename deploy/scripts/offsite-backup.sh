#!/usr/bin/env bash
set -euo pipefail

# Copy the newest database dump and uploads archive from the local backup
# directory to an off-site rclone remote, with optional GPG symmetric
# encryption and age-based retention on the remote.
#
# Credentials never live in this repository: rclone keeps provider keys in
# its own configuration file, and the GPG passphrase is referenced only by
# file path.
#
# Configuration (environment variables, normally sourced from the app .env):
#   OFFSITE_RCLONE_REMOTE        required, e.g. "myremote:mybucket"
#   OFFSITE_RCLONE_PATH          required, e.g. "ravelyth/backups"
#   OFFSITE_GPG_PASSPHRASE_FILE  optional, encrypt staged copies with gpg
#   OFFSITE_RETENTION_DAYS       optional, remote retention (default: 30)
#   ENV_FILE, BACKUP_DIR, UPLOAD_DIR  optional path overrides
#
# Install as /usr/local/sbin/ravelyth-offsite-backup (see deploy/OFFSITE_BACKUP.md).

ENV_FILE="${ENV_FILE:-/var/www/ravelyth/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ravelyth}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/ravelyth/uploads}"

if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

RETENTION_DAYS="${OFFSITE_RETENTION_DAYS:-30}"

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ -n "${OFFSITE_RCLONE_REMOTE:-}" ]] ||
  fail "OFFSITE_RCLONE_REMOTE is not set. Add it to $ENV_FILE, for example OFFSITE_RCLONE_REMOTE=myremote:mybucket."
[[ -n "${OFFSITE_RCLONE_PATH:-}" ]] ||
  fail "OFFSITE_RCLONE_PATH is not set. Add it to $ENV_FILE, for example OFFSITE_RCLONE_PATH=ravelyth/backups."
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] ||
  fail "OFFSITE_RETENTION_DAYS must be a number of days (got: $RETENTION_DAYS)."
[[ -d "$BACKUP_DIR" ]] ||
  fail "Backup directory not found: $BACKUP_DIR"
command -v rclone >/dev/null 2>&1 ||
  fail "rclone is not installed. See deploy/OFFSITE_BACKUP.md."

ENCRYPT=false
if [[ -n "${OFFSITE_GPG_PASSPHRASE_FILE:-}" ]]; then
  [[ -r "$OFFSITE_GPG_PASSPHRASE_FILE" ]] ||
    fail "GPG passphrase file is not readable: $OFFSITE_GPG_PASSPHRASE_FILE"
  command -v gpg >/dev/null 2>&1 ||
    fail "gpg is not installed but OFFSITE_GPG_PASSPHRASE_FILE is set."
  ENCRYPT=true
fi

newest_file() {
  local newest="" candidate
  for candidate in "$@"; do
    [[ -f "$candidate" ]] || continue
    if [[ -z "$newest" || "$candidate" -nt "$newest" ]]; then
      newest="$candidate"
    fi
  done
  printf '%s' "$newest"
}

today_tag="$(date +%F)"

shopt -s nullglob
dumps=("$BACKUP_DIR"/ravelyth-*.dump)
archives=(
  "$BACKUP_DIR"/uploads-*.tar
  "$BACKUP_DIR"/uploads-*.tar.gz
  "$BACKUP_DIR"/uploads-*.tgz
)
shopt -u nullglob

dump="$(newest_file "${dumps[@]}")"
[[ -n "$dump" ]] ||
  fail "No database dump (ravelyth-*.dump) found in $BACKUP_DIR. Run the local backup first (ravelyth-backup.timer)."

# Prefer an uploads archive created today; otherwise refresh the daily one so
# the off-site copy never ships a stale archive indefinitely.
archive="$(newest_file "${archives[@]}")"
if [[ -n "$archive" && "$(date -r "$archive" +%F)" == "$today_tag" ]]; then
  : # A fresh archive already exists for today.
else
  [[ -d "$UPLOAD_DIR" ]] ||
    fail "No uploads archive in $BACKUP_DIR and UPLOAD_DIR does not exist: $UPLOAD_DIR"
  archive="$BACKUP_DIR/uploads-$today_tag.tar.gz"
  temporary="$archive.tmp"
  trap 'rm -f "$temporary"' EXIT
  tar -czf "$temporary" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
  test -s "$temporary"
  mv -f "$temporary" "$archive"
  trap - EXIT
fi

umask 077
staging="$(mktemp -d "$BACKUP_DIR/.offsite.XXXXXX")"
cleanup() {
  rm -rf "$staging"
}
trap cleanup EXIT

stage() {
  local source="$1"
  local target="$staging/$(basename "$source")"
  if [[ "$ENCRYPT" == true ]]; then
    gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
      --passphrase-file "$OFFSITE_GPG_PASSPHRASE_FILE" \
      --output "$target.gpg" "$source"
  else
    cp -p "$source" "$target"
  fi
}

stage "$dump"
stage "$archive"

destination="${OFFSITE_RCLONE_REMOTE%/}/${OFFSITE_RCLONE_PATH#/}"

printf 'Uploading local backups to %s\n' "$destination"
rclone copy --transfers 2 --retries 3 --low-level-retries 5 "$staging" "$destination"

printf 'Applying %s-day retention on %s\n' "$RETENTION_DAYS" "$destination"
rclone delete "$destination" \
  --min-age "${RETENTION_DAYS}d" \
  --include 'ravelyth-*.dump*' \
  --include 'uploads-*.tar*'

printf 'Off-site backup complete.\n'
