#!/bin/sh
# Runs automatically only on a fresh database; existing installations use the explicit wrapper.
set -eu
if [ -n "${POSTGRES_PASSWORD_FILE:-}" ]; then
  POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
  export POSTGRES_PASSWORD
fi
for name in DATABASE_AUTH_PASSWORD DATABASE_BACKEND_PASSWORD DATABASE_MEDIA_WORKER_PASSWORD; do
  path=$(printenv "${name}_FILE" || true)
  if [ -n "$path" ]; then
    value=$(cat "$path")
    export "$name=$value"
  else
    value=$(printenv "$name" || true)
  fi
  [ "${#value}" -ge 24 ] || { printf 'Missing/short runtime password: %s\n' "$name" >&2; exit 78; }
  # Reject embedded line breaks while accepting the conventional final newline in secret files.
  [ "$value" = "$(printf '%s' "$value" | tr -d '\r\n')" ] || {
    printf 'Invalid multiline password: %s\n' "$name" >&2; exit 78;
  }
  [ "$value" != "${POSTGRES_PASSWORD:-}" ] || { echo 'Runtime and admin passwords must differ' >&2; exit 78; }
done
[ "$DATABASE_AUTH_PASSWORD" != "$DATABASE_BACKEND_PASSWORD" ] &&
[ "$DATABASE_AUTH_PASSWORD" != "$DATABASE_MEDIA_WORKER_PASSWORD" ] &&
[ "$DATABASE_BACKEND_PASSWORD" != "$DATABASE_MEDIA_WORKER_PASSWORD" ] || {
  echo 'Runtime passwords must be distinct' >&2; exit 78;
}
# psql reads values from the environment; passwords never appear in argv or SQL files.
if [ -n "${DATABASE_DIRECT_URL:-}" ]; then
  set -- "$DATABASE_DIRECT_URL"
else
  set -- -U "$POSTGRES_USER" -d "$POSTGRES_DB" -p "${POSTGRES_PORT:-5432}"
fi
# The init server listens only on its local socket, so the bootstrap path must bypass the URL.
if [ "${DATABASE_ROLES_EXISTING_INSTALLATION:-false}" != true ]; then
  set -- -U "$POSTGRES_USER" -d "$POSTGRES_DB"
fi
psql -X -v ON_ERROR_STOP=1 "$@" -f /opt/zglosto/migrations/016-runtime-role-grants.sql
psql -X -v ON_ERROR_STOP=1 "$@" <<'SQL'
\getenv auth_password DATABASE_AUTH_PASSWORD
\getenv backend_password DATABASE_BACKEND_PASSWORD
\getenv worker_password DATABASE_MEDIA_WORKER_PASSWORD
BEGIN;
SET LOCAL password_encryption = 'scram-sha-256';
ALTER ROLE zglosto_auth LOGIN PASSWORD :'auth_password';
ALTER ROLE zglosto_backend LOGIN PASSWORD :'backend_password';
ALTER ROLE zglosto_media_worker LOGIN PASSWORD :'worker_password';
COMMIT;
SQL
