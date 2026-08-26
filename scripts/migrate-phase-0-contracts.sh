#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS=(
  "$ROOT_DIR/database/migrations/001-incident-status-codes.sql"
  "$ROOT_DIR/database/migrations/002-resident-identity.sql"
  "$ROOT_DIR/database/migrations/003-structured-llm-fallback.sql"
  "$ROOT_DIR/database/migrations/004-service-types-catalog.sql"
  "$ROOT_DIR/database/migrations/005-inactive-service-guard.sql"
)

cd "$ROOT_DIR"

for migration in "${MIGRATIONS[@]}"; do
  printf 'Applying %s...\n' "$(basename "$migration")"
  docker compose exec -T database sh -c \
    'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
    < "$migration"
done

printf 'Database contract migrations completed.\n'
