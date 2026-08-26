#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="$ROOT_DIR/database/migrations/001-incident-status-codes.sql"

cd "$ROOT_DIR"

docker compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
  < "$MIGRATION_FILE"

printf 'Incident status migration completed.\n'
