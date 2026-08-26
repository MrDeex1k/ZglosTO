#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${SMOKE_PROJECT_NAME:-zglosto-smoke}"
HTTP_PORT="${SMOKE_HTTP_PORT:-11235}"
DATABASE_PORT="${SMOKE_DATABASE_PORT:-15432}"
WAIT_TIMEOUT="${SMOKE_WAIT_TIMEOUT:-180}"
KEEP_RUNNING="${SMOKE_KEEP_RUNNING:-0}"
ENV_FILE="${SMOKE_ENV_FILE:-$ROOT_DIR/.env.example}"

export SMOKE_HTTP_PORT="$HTTP_PORT"
export SMOKE_DATABASE_PORT="$DATABASE_PORT"
export SMOKE_PROJECT_NAME="$PROJECT_NAME"

BASE_COMPOSE=(
  docker compose
  --project-name "$PROJECT_NAME"
  --env-file "$ENV_FILE"
  --file "$ROOT_DIR/docker-compose.no-rustfs.yml"
)

COMPOSE=(
  "${BASE_COMPOSE[@]}"
  --file "$ROOT_DIR/docker-compose.rustfs.yml"
  --file "$ROOT_DIR/docker-compose.smoke.yml"
)

compose() {
  "${COMPOSE[@]}" "$@"
}

log() {
  printf '[smoke] %s\n' "$*"
}

fail() {
  printf '[smoke] ERROR: %s\n' "$*" >&2
  return 1
}

diagnostics() {
  printf '\n[smoke] Container status:\n' >&2
  compose ps >&2 || true
  printf '\n[smoke] Recent logs:\n' >&2
  compose logs --tail=150 >&2 || true
}

cleanup() {
  local status=$?
  trap - EXIT

  if [ "$status" -ne 0 ]; then
    diagnostics
  fi

  if [ "$KEEP_RUNNING" != "1" ]; then
    log "Stopping isolated smoke environment"
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  else
    log "Leaving smoke environment running (SMOKE_KEEP_RUNNING=1)"
  fi

  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

assert_contains() {
  local label=$1
  local value=$2
  local expected=$3

  if [[ "$value" != *"$expected"* ]]; then
    fail "$label does not contain expected value: $expected"
  fi
}

assert_service_state() {
  local service=$1
  local expected=$2
  local container_id state restart_count

  container_id="$(compose ps --quiet "$service")"
  [ -n "$container_id" ] || fail "Service $service has no container"

  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  [ "$state" = "$expected" ] || fail "Service $service state is $state, expected $expected"

  restart_count="$(docker inspect --format '{{.RestartCount}}' "$container_id")"
  [ "$restart_count" = "0" ] || fail "Service $service restarted $restart_count time(s)"
}

assert_not_published() {
  local service=$1
  local port=$2
  local container_id binding

  container_id="$(compose ps --quiet "$service")"
  [ -n "$container_id" ] || fail "Service $service has no container"

  binding="$(docker inspect --format "{{json (index .HostConfig.PortBindings \"$port/tcp\")}}" "$container_id")"
  [ "$binding" = "null" ] || [ "$binding" = "[]" ] || fail "$service:$port is unexpectedly published as $binding"
}

cd "$ROOT_DIR"

[ -f "$ENV_FILE" ] || fail "Missing smoke environment file: $ENV_FILE"
command -v docker >/dev/null 2>&1 || fail "docker is not installed"
command -v curl >/dev/null 2>&1 || fail "curl is not installed"
command -v openssl >/dev/null 2>&1 || fail "openssl is not installed"

log "Generating isolated development certificate hierarchy"
"$ROOT_DIR/scripts/generate-dev-certificates.sh"

log "Validating Compose configuration"
env S3_ENDPOINT=https://object-storage.example.invalid S3_AUTO_CREATE_BUCKET=false \
  "${BASE_COMPOSE[@]}" config --format json | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const config = JSON.parse(input);
      if (Object.hasOwn(config.services, "rustfs")) process.exit(1);
      const backend = config.services.backend;
      const mediaWorker = config.services.media_worker;
      if (Object.hasOwn(backend.depends_on, "rustfs")) process.exit(2);
      if (backend.environment.S3_ENDPOINT !== "https://object-storage.example.invalid") process.exit(3);
      if (Object.keys(backend.environment).some((name) => name.startsWith("RUSTFS_"))) process.exit(4);
      if (Object.hasOwn(mediaWorker, "ports") || Object.hasOwn(mediaWorker, "expose")) process.exit(5);
      if (mediaWorker.environment.S3_ENDPOINT !== "https://object-storage.example.invalid") process.exit(6);
      if (mediaWorker.environment.SERVICE_NAME !== "media_worker") process.exit(7);
      if (Object.keys(mediaWorker.environment).some((name) => name.startsWith("RUSTFS_"))) process.exit(8);
    });
  '
compose config --quiet

log "Removing stale containers for project $PROJECT_NAME"
compose down --volumes --remove-orphans >/dev/null 2>&1 || true

log "Building and starting Compose services"
compose up --detach --build --wait --wait-timeout "$WAIT_TIMEOUT"

log "Checking container health and restart counts"
for service in database pgbouncer rabbitmq rustfs authorization backend media_worker llm_gateway frontend nginx; do
  assert_service_state "$service" healthy
done

log "Checking that application database traffic uses PgBouncer"
for service in authorization backend media_worker; do
  compose exec -T "$service" node -e \
    "const fs = require('node:fs'); const url = new URL(process.env.DATABASE_URL); if (url.hostname !== 'pgbouncer') process.exit(1); if (Object.hasOwn(process.env, 'DATABASE_DIRECT_URL')) process.exit(2); if (!fs.statSync(process.env.DATABASE_TLS_CA_PATH).isFile()) process.exit(3); if (fs.existsSync('/run/secrets/database/pgbouncer-server.key') || fs.existsSync('/run/secrets/database/postgres-server.key')) process.exit(4)"
done

log "Checking the standalone media_worker boundary"
compose exec -T media_worker node dist/nest/media-worker/healthcheck.js
compose exec -T media_worker node -e \
  "if (process.env.SERVICE_NAME !== 'media_worker') process.exit(1); if (!Object.hasOwn(process.env, 'S3_ENDPOINT')) process.exit(2); if (Object.hasOwn(process.env, 'AUTH_SERVICE_URL')) process.exit(3); if (new URL(process.env.RABBITMQ_URL).protocol !== 'amqps:') process.exit(4); if (Object.keys(process.env).some((name) => name.startsWith('RUSTFS_'))) process.exit(5);"

log "Checking TLS 1.3 on both database transport segments"
compose exec -T pgbouncer sh -c \
  'grep -qx "client_tls_sslmode = require" /etc/pgbouncer/pgbouncer.ini &&
   grep -qx "client_tls_protocols = tlsv1.3" /etc/pgbouncer/pgbouncer.ini &&
   grep -qx "server_tls_sslmode = verify-full" /etc/pgbouncer/pgbouncer.ini &&
   grep -qx "server_tls_protocols = tlsv1.3" /etc/pgbouncer/pgbouncer.ini &&
   test "$(psql -v ON_ERROR_STOP=1 "$PGBOUNCER_CLIENT_URL" -tAc "SELECT ssl::text || '\''|'\'' || version FROM pg_stat_ssl WHERE pid = pg_backend_pid()")" = "true|TLSv1.3"'
compose exec -T database sh -c \
  'test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT ssl::text || '\''|'\'' || version FROM pg_stat_ssl WHERE pid = pg_backend_pid()")" = "true|TLSv1.3"'

log "Checking that PostgreSQL and PgBouncer reject plaintext clients"
compose exec -T database sh -c \
  'if PGSSLMODE=disable psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then exit 1; fi'
compose exec -T pgbouncer sh -c \
  'if PGSSLMODE=disable psql "$PGBOUNCER_CLIENT_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then exit 1; fi'

log "Checking the neutral S3 Object Storage boundary"
compose exec -T backend node -e \
  "if (Object.keys(process.env).some((name) => name.startsWith('RUSTFS_'))) process.exit(1)"
compose exec -T backend node dist/storage/verify-storage.js

log "Checking that Phase 0 database migrations are repeatable"
for migration in "$ROOT_DIR"/database/migrations/*.sql; do
  compose exec -T database sh -c \
    'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
    < "$migration" >/dev/null
done

log "Checking that internal API ports are not published"
assert_not_published backend 3000
assert_not_published media_worker 3000
assert_not_published authorization 9955
assert_not_published authorization 9956
assert_not_published pgbouncer 6432
assert_not_published rabbitmq 5671
assert_not_published rabbitmq 15672
assert_not_published rustfs 9000
assert_not_published rustfs 9001

compose exec -T rabbitmq sh -c \
  'rabbitmq-diagnostics -q ping && rabbitmq-diagnostics -q listeners | grep -q "port: 5671, protocol: amqp/ssl" && ! rabbitmq-diagnostics -q listeners | grep -q "port: 5672, protocol: amqp" && ! rabbitmq-diagnostics -q listeners | grep -q "port: 15672"'

BASE_URL="http://127.0.0.1:$HTTP_PORT"

log "Checking frontend through Nginx"
for route in / /login /register /dashboard /dashboard/admin /dashboard/sluzby /dashboard/mieszkaniec; do
  frontend_response="$(curl --fail --silent --show-error "$BASE_URL$route")"
  assert_contains "Frontend response for $route" "$frontend_response" '<title>ZglosTO</title>'
done

log "Checking Nginx health"
nginx_health="$(curl --fail --silent --show-error "$BASE_URL/health")"
assert_contains "Nginx health" "$nginx_health" '"service":"nginx"'

log "Checking backend health through /api"
backend_health="$(curl --fail --silent --show-error "$BASE_URL/api/health")"
assert_contains "Backend health" "$backend_health" '"service":"backend"'
assert_contains "Backend health" "$backend_health" '"database":"up"'
assert_contains "Backend health" "$backend_health" '"objectStorage":"up"'
assert_contains "Backend health" "$backend_health" '"config":{'
assert_contains "Backend config" "$backend_health" '"status":"valid"'

log "Checking internal authorization readiness"
authorization_health="$(compose exec -T authorization node -e \
  "import('./dist/src/healthcheck.js').catch(() => process.exit(1))")"
assert_contains "Authorization readiness" "$authorization_health" '"service":"authorization"'
assert_contains "Authorization readiness" "$authorization_health" '"database":"up"'
assert_contains "Authorization readiness" "$authorization_health" '"config":{'
assert_contains "Authorization config" "$authorization_health" '"status":"valid"'

log "Checking internal frontend readiness artifact"
frontend_health="$(compose exec -T frontend wget -q -O - http://127.0.0.1/health/ready)"
assert_contains "Frontend readiness" "$frontend_health" '"service":"frontend"'
assert_contains "Frontend readiness" "$frontend_health" '"config":{'
assert_contains "Frontend config" "$frontend_health" '"status":"valid"'

log "Checking authorization routing"
curl --fail --silent --show-error "$BASE_URL/api/auth/get-session" >/dev/null

log "Checking disabled-by-default LLM health through /llm"
llm_health="$(curl --fail --silent --show-error "$BASE_URL/llm/health")"
assert_contains "LLM health" "$llm_health" '"service":"llm_gateway"'
assert_contains "LLM health" "$llm_health" '"enabled":false'
assert_contains "LLM health" "$llm_health" '"loaded":false'
assert_contains "LLM health" "$llm_health" '"error":"model_disabled"'

log "Checking that the resident incident list requires a session"
resident_list_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$BASE_URL/api/mieszkaniec/incydenty")"
[ "$resident_list_status" = "401" ] || fail "Resident incident list returned $resident_list_status, expected 401"

log "Checking anonymous incident persistence with structured LLM fallback"
anonymous_incident="$(curl --fail --silent --show-error \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"opis_zgloszenia":"Uszkodzona latarnia","mail_zglaszajacego":"  SMOKE.Resident@Example.COM ","adres_zgloszenia":"ul. Testowa 1","typ_sluzby":"roads"}' \
  "$BASE_URL/api/mieszkaniec/incydenty")"
assert_contains "Anonymous incident" "$anonymous_incident" '"mail_zglaszajacego":"smoke.resident@example.com"'
assert_contains "Anonymous incident" "$anonymous_incident" '"reporter_user_id":null'
assert_contains "Anonymous incident" "$anonymous_incident" '"classification":"unknown"'
assert_contains "Anonymous incident" "$anonymous_incident" '"serviceKey":"other"'
assert_contains "Anonymous incident" "$anonymous_incident" '"modelAvailable":false'
assert_contains "Anonymous incident" "$anonymous_incident" '"source":"fallback"'
assert_contains "Anonymous incident" "$anonymous_incident" '"reason":"disabled"'

log "PASS: Compose startup and same-origin routing are healthy"
