#!/usr/bin/env bash
# Nightly backup of the game's SQLite database.
#
# Uses SQLite's online backup (via the app's own better-sqlite3), which is safe
# while the game is running. A plain file copy is NOT safe: the database runs in
# WAL mode, so the data is split across more than one file.
#
# Keeps 14 days locally. If BACKUP_REMOTE is set (e.g. u123456@u123456.your-storagebox.de:fewclues),
# each backup is also copied there with rsync over SSH. Keep at least one copy OFF this server.
#
# Cron (as the deploy user):   17 3 * * *  /home/deploy/fewclues/deploy/backup.sh >> /home/deploy/backups/backup.log 2>&1
set -euo pipefail

CONTAINER="${CONTAINER:-fewclues}"
DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="fewclues-$STAMP.db"

mkdir -p "$DIR"

docker exec "$CONTAINER" node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/data/fewclues.db', { readonly: true });
  db.backup('/data/$FILE').then(() => { db.close(); }).catch((e) => { console.error(e); process.exit(1); });
"
docker cp "$CONTAINER:/data/$FILE" "$DIR/$FILE"
docker exec "$CONTAINER" rm -f "/data/$FILE"

# Check it before trusting it.
if [ "$(sqlite3 "$DIR/$FILE" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "$(date -u +%FT%TZ) BACKUP FAILED integrity check: $FILE" >&2
  rm -f "$DIR/$FILE"
  exit 1
fi
gzip -9 "$DIR/$FILE"
echo "$(date -u +%FT%TZ) ok $FILE.gz ($(du -h "$DIR/$FILE.gz" | cut -f1))"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -az "$DIR/$FILE.gz" "$BACKUP_REMOTE/" && echo "$(date -u +%FT%TZ) copied offsite"
fi

find "$DIR" -name 'fewclues-*.db.gz' -mtime +"$KEEP_DAYS" -delete
