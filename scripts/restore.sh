#!/usr/bin/env bash
# =============================================================================
# Restore a backup made by scripts/backup.sh (Docker Compose installation).
#
#   scripts/restore.sh backups/2026-11-05_030000
#
# THIS REPLACES ALL CURRENT DATA (database and photos) with the backup.
# It asks you to type "restore" first (or set RESTORE_CONFIRM=restore).
#
# What it does:
#   1. stops the app (the database keeps running);
#   2. empties the database and loads the dump;
#   3. empties the photo folder and unpacks the photos;
#   4. starts the app again, which applies any newer database migrations,
#      so a backup made with an older version of the app can be restored too.
#
#   COMPOSE="docker compose -f /srv/inventory/docker-compose.yml"  (optional)
# =============================================================================
set -euo pipefail
# Git Bash on Windows would otherwise rewrite container paths like /data/uploads.
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.."

COMPOSE="${COMPOSE:-docker compose}"
SRC="${1:-}"

if [ -z "$SRC" ] || [ ! -f "$SRC/database.dump" ] || [ ! -f "$SRC/photos.tar.gz" ]; then
  echo "Usage: scripts/restore.sh <backup folder>"
  echo "The folder must contain database.dump and photos.tar.gz (made by scripts/backup.sh)."
  [ -n "$SRC" ] && echo "Not found in: $SRC"
  exit 1
fi
[ "$(head -c 5 "$SRC/database.dump")" = "PGDMP" ] || { echo "$SRC/database.dump isn't a pg_dump custom-format file."; exit 1; }
gzip -t "$SRC/photos.tar.gz" 2>/dev/null || { echo "$SRC/photos.tar.gz is damaged."; exit 1; }

echo "This will REPLACE ALL CURRENT DATA (database and photos) with the backup in:"
echo "  $SRC"
if [ "${RESTORE_CONFIRM:-}" != "restore" ]; then
  read -r -p 'Type "restore" to continue: ' answer
  [ "$answer" = "restore" ] || { echo "Cancelled. Nothing was changed."; exit 1; }
fi

echo "Stopping the app…"
$COMPOSE stop app

echo "Restoring the database…"
$COMPOSE exec -T db psql -U inventory -d inventory -v ON_ERROR_STOP=1 -q \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
$COMPOSE exec -T db pg_restore -U inventory -d inventory --no-owner --exit-on-error <"$SRC/database.dump"

echo "Restoring photos…"
$COMPOSE run --rm -T --no-deps --entrypoint sh app \
  -c 'find /data/uploads -mindepth 1 -delete && tar -C /data/uploads -xzf -' <"$SRC/photos.tar.gz"

echo "Starting the app…"
$COMPOSE up -d app
echo "Done. The app applies any newer database migrations as it starts; check it with:"
echo "  $COMPOSE ps      (app should become \"healthy\")"
