#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS=("$ROOT_DIR"/database/migrations/*.sql)

cd "$ROOT_DIR"

# All writes must remain stopped until replacement clients use the new URL files.
docker compose stop --timeout 120 nginx authorization backend media_worker pgbouncer

for migration in "${MIGRATIONS[@]}"; do
  printf 'Applying %s...\n' "$(basename "$migration")"
  docker compose exec -T database /usr/local/bin/load-container-secrets sh -c \
    'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
    < "$migration"
done

docker compose exec -T -e DATABASE_ROLES_EXISTING_INSTALLATION=true database \
  /usr/local/bin/load-container-secrets sh /docker-entrypoint-initdb.d/06-runtime-roles.sh

printf 'Database contract migrations completed.\n'
