#!/usr/bin/env bash
# =============================================================================
# Back up the Nordic Events Inventory (Docker Compose installation):
# the PostgreSQL database and the photo folder.
#
#   scripts/backup.sh                 → ./backups/2026-11-05_0300/
#   scripts/backup.sh /mnt/nas/inv    → /mnt/nas/inv/2026-11-05_0300/
#
# Each backup folder holds:
#   database.dump    PostgreSQL custom-format dump (pg_dump -Fc)
#   photos.tar.gz    every uploaded photo
#
# Safe to run while the app is in use. Old backups are deleted so only the
# newest BACKUP_KEEP (default 14) are kept.
#
# Settings (environment variables, all optional):
#   BACKUP_KEEP=14                    how many backups to keep (0 = keep all)
#   COMPOSE="docker compose"          how to call Docker Compose, e.g.
#                                     COMPOSE="docker compose -f /srv/inventory/docker-compose.yml"
#
# Run it every night with cron, e.g. (crontab -e):
#   0 3 * * *  cd /srv/nordic-inventory && scripts/backup.sh /srv/backups/inventory >> /var/log/inventory-backup.log 2>&1
# Copy the backup folder to another machine too: a backup on the same disk
# doesn't help if that disk dies.
# =============================================================================
set -euo pipefail
# Git Bash on Windows would otherwise rewrite container paths like /data/uploads.
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."

COMPOSE="${COMPOSE:-docker compose}"
KEEP="${BACKUP_KEEP:-14}"
ROOT="${1:-./backups}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="$ROOT/$STAMP"

fail() { echo "BACKUP FAILED: $*" >&2; rm -rf "$DEST"; exit 1; }

mkdir -p "$DEST"
echo "[$(date '+%F %T')] Backing up to $DEST"

echo "  database…"
$COMPOSE exec -T db pg_dump -U inventory -d inventory --format=custom --no-owner >"$DEST/database.dump" \
  || fail "pg_dump didn't work. Is the database container running? ($COMPOSE ps)"
[ -s "$DEST/database.dump" ] || fail "the database dump is empty"
# A real pg_dump custom-format file starts with "PGDMP".
[ "$(head -c 5 "$DEST/database.dump")" = "PGDMP" ] || fail "the database dump doesn't look valid"

echo "  photos…"
$COMPOSE exec -T app tar -C /data/uploads -czf - . >"$DEST/photos.tar.gz" \
  || fail "couldn't read the photo folder. Is the app container running? ($COMPOSE ps)"
gzip -t "$DEST/photos.tar.gz" 2>/dev/null || fail "the photo archive is damaged"

echo "  done: $(du -sh "$DEST" | cut -f1) in $DEST"

if [ "$KEEP" -gt 0 ]; then
  # Backup folders are named by date, so sorting by name = oldest first.
  old=$(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9]-*' | sort | head -n "-$KEEP")
  if [ -n "$old" ]; then
    echo "$old" | while read -r dir; do echo "  removing old backup $dir"; rm -rf "$dir"; done
  fi
fi
