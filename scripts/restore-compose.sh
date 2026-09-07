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

for required_file in database.dump object-storage.ndjson.gz metadata.txt object-storage-audit.json SHA256SUMS; do
  if [ ! -f "$backup_directory/$required_file" ]; then
    printf 'Missing backup file: %s\n' "$required_file" >&2
    exit 66
  fi
done

if ! grep -qx 'format=zglosto-compose-backup' "$backup_directory/metadata.txt" \
  || ! grep -qx 'version=1' "$backup_directory/metadata.txt"; then
  printf 'Unsupported backup metadata\n' >&2
  exit 65
fi

printf '[restore] Verifying archive checksums\n'
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_directory" && sha256sum --check SHA256SUMS)
else
  (cd "$backup_directory" && shasum -a 256 --check SHA256SUMS)
fi

restore_failed() {
  local result=$?
  if [ "$result" -ne 0 ]; then
    printf '[restore] Failed; application writers remain stopped. Complete restore and audit before restarting services.\n' >&2
  fi
}
trap restore_failed EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stop_for_maintenance nginx authorization backend media_worker pgbouncer

printf '[restore] Restoring PostgreSQL through the direct connection\n'
"${compose[@]}" exec -T database sh -c \
  'pg_restore --dbname="$DATABASE_DIRECT_URL" --clean --if-exists --exit-on-error --no-owner --no-privileges' \
  < "$backup_directory/database.dump"

printf '[restore] Restoring Object Storage through the active S3-compatible provider\n'
"${compose[@]}" run --rm --no-deps -T backend \
  node dist/operations/object-storage-archive-cli.js restore \
  < "$backup_directory/object-storage.ndjson.gz"

printf '[restore] Verifying database/Object Storage consistency\n'
# The isolated audit needs PgBouncer, but no application writer may start yet.
"${compose[@]}" start --wait --wait-timeout 120 pgbouncer >/dev/null
"${compose[@]}" run --rm --no-deps -T backend node dist/operations/object-storage-audit-cli.js \
  > "$backup_directory/post-restore-object-storage-audit.json"

if [ "${#services_to_resume[@]}" -eq 0 ] || [[ " ${services_to_resume[*]} " != *' pgbouncer '* ]]; then
  "${compose[@]}" stop pgbouncer >/dev/null
fi
resume_application
trap - EXIT INT TERM

printf '[restore] Completed successfully\n'
