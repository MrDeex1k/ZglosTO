#!/bin/sh
set -eu

if [ "${PHASE5_ALLOW_LOCAL_FIXTURES:-}" != "1" ]; then
  echo "Set PHASE5_ALLOW_LOCAL_FIXTURES=1 to modify the disposable local LOAD-A fixture." >&2
  exit 1
fi

action="${1:-}"
case "$action" in
  seed) sql_file="$(dirname "$0")/phase5-load-a.sql" ;;
  clear) sql_file="$(dirname "$0")/clear-phase5-load-a.sql" ;;
  seed-acceptance) sql_file="$(dirname "$0")/phase5-acceptance-fixture.sql" ;;
  clear-acceptance) sql_file="$(dirname "$0")/clear-phase5-acceptance-fixture.sql" ;;
  *)
    echo "Usage: $0 seed|clear|seed-acceptance|clear-acceptance" >&2
    exit 1
    ;;
esac

docker_context="${PHASE5_DOCKER_CONTEXT:-orbstack}"
database_container="${PHASE5_DATABASE_CONTAINER:-zglosto-postgres}"
compose_project="$(docker --context "$docker_context" inspect \
  --format '{{index .Config.Labels "com.docker.compose.project"}}' "$database_container")"

if [ "$compose_project" != "zglosto" ]; then
  echo "Refusing to modify container outside the local zglosto Compose project." >&2
  exit 1
fi

docker --context "$docker_context" exec -i "$database_container" sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$sql_file"
