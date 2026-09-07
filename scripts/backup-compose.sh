#!/usr/bin/env bash

set -Eeuo pipefail

if [ "$#" -lt 1 ]; then
  printf 'Usage: %s BACKUP_DIRECTORY [docker compose options...]\n' "$0" >&2
  exit 64
fi

backup_directory=$1
shift
compose=(docker compose "$@")
source "$(dirname "${BASH_SOURCE[0]}")/lib/compose-maintenance.sh"
umask 077

if [ -e "$backup_directory" ] && [ -n "$(find "$backup_directory" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  printf 'Backup directory must be empty: %s\n' "$backup_directory" >&2
  exit 65
fi
mkdir -p "$backup_directory"

finish_backup() {
  local result=$?
  trap - EXIT
  resume_application || result=1
  exit "$result"
}
trap finish_backup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Auth can claim anonymous incidents; the backend publishes jobs; the worker
# updates image references and deletes originals. All writers must be quiescent.
stop_for_maintenance nginx authorization backend media_worker

printf '[backup] Auditing Object Storage references\n'
set +e
"${compose[@]}" run --rm --no-deps -T backend node dist/operations/object-storage-audit-cli.js \
  > "$backup_directory/object-storage-audit.json"
audit_status=$?
set -e
if [ "$audit_status" -ne 0 ] && [ "$audit_status" -ne 2 ]; then
  printf 'Object Storage audit failed with status %s\n' "$audit_status" >&2
  exit "$audit_status"
fi

printf '[backup] Creating PostgreSQL logical backup through the direct connection\n'
"${compose[@]}" exec -T database sh -c \
  'pg_dump --dbname="$DATABASE_DIRECT_URL" --format=custom --no-owner --no-privileges' \
  > "$backup_directory/database.dump"

printf '[backup] Creating provider-neutral Object Storage archive\n'
"${compose[@]}" run --rm --no-deps -T backend node dist/operations/object-storage-archive-cli.js backup \
  > "$backup_directory/object-storage.ndjson.gz"

created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf 'format=zglosto-compose-backup\nversion=1\ncreated_at=%s\n' "$created_at" \
  > "$backup_directory/metadata.txt"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_directory" && sha256sum database.dump object-storage.ndjson.gz metadata.txt object-storage-audit.json) \
    > "$backup_directory/SHA256SUMS"
else
  (cd "$backup_directory" && shasum -a 256 database.dump object-storage.ndjson.gz metadata.txt object-storage-audit.json) \
    > "$backup_directory/SHA256SUMS"
fi

printf '[backup] Completed: %s\n' "$backup_directory"
if [ "$audit_status" -eq 2 ]; then
  printf '[backup] WARNING: the pre-backup audit found missing or orphaned objects; inspect object-storage-audit.json\n' >&2
fi
