# Off-site backups

Local backups (see `DEPLOYMENT.md` section 9) keep database dumps in
`/var/backups/ravelyth` on the server itself. If the server is lost, those
go with it. This document explains how to copy the newest database dump and
uploads archive to a separate storage provider ("off-site") every day, and
how to restore from that copy.

The off-site copy uses [rclone](https://rclone.org/), which supports many
storage providers (AWS S3 and compatible services, Backblaze B2, Google
Drive, OneDrive, SFTP, and others). Provider credentials are stored by
rclone in its own configuration file on the server — **never in this
repository and never in `.env`**.

The service and timer files ship **disabled**. Nothing runs off-site until
you follow step 7 below.

## What runs

- `deploy/scripts/offsite-backup.sh`, installed as
  `/usr/local/sbin/ravelyth-offsite-backup`.
- `deploy/systemd/ravelyth-offsite-backup.service` (a one-shot job) and
  `deploy/systemd/ravelyth-offsite-backup.timer` (daily at 03:15 server
  time, after the 02:15 local database backup, with up to 15 minutes of
  random delay).

Each run:

1. Picks the newest `ravelyth-*.dump` in `/var/backups/ravelyth` (fails if
   none exists, so enable the local backup timer first).
2. Picks the newest uploads archive (`uploads-*.tar*`) in the same
   directory. If no archive was created today, it creates
   `uploads-YYYY-MM-DD.tar.gz` from `/var/lib/ravelyth/uploads` so the
   off-site copy is never stale.
3. Stages both files in a private temporary directory, optionally
   encrypting each one with GPG (AES-256) when configured.
4. Uploads the staged files with `rclone copy` to
   `OFFSITE_RCLONE_REMOTE/OFFSITE_RCLONE_PATH`.
5. Deletes remote files older than `OFFSITE_RETENTION_DAYS` (default 30
   days), but only files matching `ravelyth-*.dump*` or `uploads-*.tar*`,
   so nothing else in the remote folder is touched.

## One-time setup

### 1. Prerequisites

```bash
# The local database backup timer must be running first.
sudo systemctl enable --now ravelyth-backup.timer
sudo systemctl status ravelyth-backup.timer --no-pager

# rclone (and GPG, if you want encryption).
sudo apt-get update && sudo apt-get install -y rclone gnupg
```

### 2. Create the rclone remote (once)

Run the interactive wizard as the `ravelyth` user so the config file is
owned by the account that will use it:

```bash
sudo -u ravelyth rclone config
```

1. Press `n` to create a new remote.
2. Give it a short name, for example `offsite` (this becomes
   `offsite:some-bucket` style addresses).
3. Choose your provider from the numbered list (for example an S3-compatible
   bucket, Backblaze B2, Google Drive, OneDrive, or SFTP) and answer the
   questions. Your provider's website shows the access key / secret key /
   endpoint values it asks for.
4. Accept the defaults for the remaining questions unless your provider
   documentation says otherwise.
5. Finish; rclone writes `/var/www/ravelyth/.config/rclone/rclone.conf`.

Verify it works:

```bash
sudo -u ravelyth rclone listremotes        # should list "offsite:"
sudo -u ravelyth rclone lsd offsite:       # should list your buckets/folders
```

The config file contains your storage credentials. Keep it readable only by
`ravelyth` (rclone creates it with safe permissions; check with
`ls -l /var/www/ravelyth/.config/rclone/rclone.conf`).

### 3. Configure the application environment

Add these lines to `/var/www/ravelyth/.env` (values only — no rclone
credentials belong here):

```bash
# Off-site backups (deploy/scripts/offsite-backup.sh)
OFFSITE_RCLONE_REMOTE=offsite:my-bucket
OFFSITE_RCLONE_PATH=ravelyth/backups
# Optional: remote retention in days (default 30)
OFFSITE_RETENTION_DAYS=30
```

`OFFSITE_RCLONE_REMOTE` is the rclone remote name plus the bucket/folder
(`offsite:my-bucket`); `OFFSITE_RCLONE_PATH` is the sub-folder inside it
(`ravelyth/backups`). The script uploads to the two joined with a slash.

### 4. Optional: encrypt the off-site copies with GPG

Off-site copies contain resumes and other personal data, so encryption is
recommended when the provider is not already encrypted at rest.

```bash
sudo -u ravelyth bash -c 'umask 077; printf %s "pick-a-long-random-passphrase" > /var/www/ravelyth/.offsite-passphrase'
echo 'OFFSITE_GPG_PASSPHRASE_FILE=/var/www/ravelyth/.offsite-passphrase' | sudo tee -a /var/www/ravelyth/.env
```

- Store the passphrase somewhere else as well (password manager): without it
  the encrypted copies cannot be read.
- The file must stay readable only by `ravelyth`
  (`ls -l` should show `-rw-------`).

### 5. Install the script and systemd units

```bash
sudo install -m 0755 -o root -g root \
  /var/www/ravelyth/deploy/scripts/offsite-backup.sh \
  /usr/local/sbin/ravelyth-offsite-backup
sudo cp /var/www/ravelyth/deploy/systemd/ravelyth-offsite-backup.service \
  /var/www/ravelyth/deploy/systemd/ravelyth-offsite-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

### 6. Test one run manually

```bash
sudo systemctl start ravelyth-offsite-backup.service
journalctl -u ravelyth-offsite-backup.service -n 50 --no-pager
sudo -u ravelyth rclone ls offsite:ravelyth/backups
```

Expect `Off-site backup complete.` in the log and one or two files listed by
`rclone ls`. The timer is still not enabled at this point.

### 7. Enable the daily timer (only after the manual test passes)

```bash
sudo systemctl enable --now ravelyth-offsite-backup.timer
systemctl list-timers | grep ravelyth
```

## Day-to-day operations

- **Check it is running:** `systemctl list-timers | grep ravelyth` shows the
  next run; `journalctl -u ravelyth-offsite-backup.service -n 100 --no-pager`
  shows recent runs (each successful run ends with
  `Off-site backup complete.`).
- **Rotate storage credentials:** rerun `sudo -u ravelyth rclone config` and
  edit/recreate the remote; no change to `.env` is needed.
- **Change retention:** edit `OFFSITE_RETENTION_DAYS` in `.env`; the next run
  prunes the remote.
- **Change the passphrase:** create a new passphrase file and update
  `.env`. Already-uploaded encrypted files keep the old passphrase, so
  download/decrypt anything you still need first.
- **Stop:** `sudo systemctl disable --now ravelyth-offsite-backup.timer`
  (local backups continue independently).

## Restore

1. Fetch the files:
   `sudo -u ravelyth rclone copy offsite:ravelyth/backups /root/restore --include 'ravelyth-*.dump*' --include 'uploads-*.tar*'`
2. If encrypted, decrypt each file:
   `gpg --decrypt --passphrase-file <passphrase-file> ravelyth-YYYY-MM-DD.dump.gpg > ravelyth-YYYY-MM-DD.dump`
3. Database: `pg_restore --clean --if-exists --dbname=<DATABASE_URL> ravelyth-YYYY-MM-DD.dump`
   (run against a scratch database first to rehearse).
4. Uploads: extract the archive so it becomes
   `/var/lib/ravelyth/uploads`, with the correct ownership:
   `sudo tar -xzf uploads-YYYY-MM-DD.tar.gz -C /var/lib && sudo chown -R ravelyth:ravelyth /var/lib/ravelyth/uploads`

Test a full restore on a scratch database regularly; an untested backup is
not a backup.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `No database dump ... found` | Local backup has not run yet — enable `ravelyth-backup.timer` (DEPLOYMENT.md section 9), run `sudo systemctl start ravelyth-backup.service`, retry. |
| `OFFSITE_RCLONE_REMOTE is not set` | The variable is missing from `/var/www/ravelyth/.env`. |
| `rclone is not installed` | `sudo apt-get install rclone` (or use rclone's install script). |
| rclone auth errors in the journal | Rerun `sudo -u ravelyth rclone config` / `rclone config reconnect offsite:`; check the provider keys. |
| `GPG passphrase file is not readable` | Wrong path in `OFFSITE_GPG_PASSPHRASE_FILE`, or file not owned by `ravelyth`. |
| Uploads archive missing and `UPLOAD_DIR does not exist` | `UPLOAD_DIR` override is wrong; the default is `/var/lib/ravelyth/uploads`. |
| Timer never fires | `systemctl status ravelyth-offsite-backup.timer`; confirm it is enabled and note that `OnCalendar` uses the server's local timezone. |

Security notes: both database dumps and uploads contain personal data —
treat every copy (local or off-site) as sensitive; never commit
`rclone.conf`, passphrase files, or `.env`.
