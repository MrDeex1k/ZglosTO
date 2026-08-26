#!/bin/sh
set -eu

if [ "${PHASE6_ALLOW_LOCAL_ROLE_FIXTURE:-}" != "1" ]; then
  echo "Set PHASE6_ALLOW_LOCAL_ROLE_FIXTURE=1 to modify the disposable local role fixture." >&2
  exit 1
fi

action="${1:-}"
email="${PHASE6_ROLE_EMAIL:-}"
script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
fixture_sql="$script_dir/set-phase6-role-fixture.sql"

case "$email" in
  phase6.role.*@example.test) ;;
  *)
    echo "PHASE6_ROLE_EMAIL must identify a disposable phase6.role.*@example.test account." >&2
    exit 1
    ;;
esac

case "$action" in
  admin)
    role='admin'
    service_key=''
    expected='admin:'
    ;;
  service)
    role='sluzby'
    service_key='roads'
    expected='sluzby:roads'
    ;;
  *)
    echo "Usage: $0 admin|service" >&2
    exit 1
    ;;
esac

response=$(docker --context orbstack compose \
  --project-name zglosto \
  --file "$project_dir/docker-compose.yml" \
  --file "$project_dir/docker-compose.redis.local.yml" \
  exec -T database sh -lc \
    'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -Atq -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v role_email="$1" -v role="$2" -v service_key="$3"' \
    sh "$email" "$role" "$service_key" <"$fixture_sql")

if [ "$response" != "$expected" ]; then
  echo "Local Phase 6 role fixture was not updated exactly once." >&2
  exit 1
fi

echo "Local Phase 6 role fixture set to $role."
