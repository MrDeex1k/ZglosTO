#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${INTEGRATION_PROJECT_NAME:-zglosto-phase0}"
HTTP_PORT="${INTEGRATION_HTTP_PORT:-11335}"
DATABASE_PORT="${INTEGRATION_DATABASE_PORT:-16432}"
AUTHORIZATION_MTLS_PORT="${INTEGRATION_AUTHORIZATION_MTLS_PORT:-19956}"
RABBITMQ_TLS_PORT="${INTEGRATION_RABBITMQ_TLS_PORT:-15671}"
WAIT_TIMEOUT="${INTEGRATION_WAIT_TIMEOUT:-180}"
KEEP_RUNNING="${INTEGRATION_KEEP_RUNNING:-0}"
REDIS_MODE="${INTEGRATION_REDIS_MODE:-disabled}"
REDIS_FAILURE_ONLY="${INTEGRATION_REDIS_FAILURE_ONLY:-0}"
ENV_FILE="$ROOT_DIR/tests/integration/integration.env"
BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zglosto-restore-test.XXXXXX")"

export INTEGRATION_PROJECT_NAME="$PROJECT_NAME"
export INTEGRATION_HTTP_PORT="$HTTP_PORT"
export INTEGRATION_DATABASE_PORT="$DATABASE_PORT"
export INTEGRATION_AUTHORIZATION_MTLS_PORT="$AUTHORIZATION_MTLS_PORT"
export INTEGRATION_RABBITMQ_TLS_PORT="$RABBITMQ_TLS_PORT"

BASE_COMPOSE=(
  docker compose
  --project-name "$PROJECT_NAME"
  --env-file "$ENV_FILE"
  --file "$ROOT_DIR/docker-compose.no-rustfs.yml"
)

COMPOSE=(
  "${BASE_COMPOSE[@]}"
  --file "$ROOT_DIR/docker-compose.rustfs.yml"
  --file "$ROOT_DIR/docker-compose.integration.yml"
)

if [ "$REDIS_MODE" = "local" ]; then
  export REDIS_ACL_FILE="$ROOT_DIR/tests/fixtures/redis/users.acl"
  export REDIS_URL_SECRET_FILE="$ROOT_DIR/tests/fixtures/redis/url"
  export RATE_LIMIT_HMAC_KEY_SECRET_FILE="$ROOT_DIR/tests/fixtures/redis/rate-limit-hmac"
  export INTEGRATION_EXPECTED_REDIS_STATUS=up
  COMPOSE+=(--file "$ROOT_DIR/docker-compose.redis.local.yml")
elif [ "$REDIS_MODE" = "disabled" ]; then
  export INTEGRATION_EXPECTED_REDIS_STATUS=disabled
else
  printf '[integration] ERROR: INTEGRATION_REDIS_MODE must be disabled or local\n' >&2
  exit 1
fi

compose() {
  "${COMPOSE[@]}" "$@"
}

log() {
  printf '[integration] %s\n' "$*"
}

diagnostics() {
  printf '\n[integration] Container status:\n' >&2
  compose ps >&2 || true
  printf '\n[integration] Media job state:\n' >&2
  compose exec -T database sh -c \
    'psql "$DATABASE_DIRECT_URL" -x -c "SELECT job.id, job.status, job.attempt_count, job.last_failure_code, image.status AS image_status, image.failure_code FROM media_processing_jobs job JOIN incident_images image ON image.id = job.image_id ORDER BY job.created_at"' \
    >&2 || true
  printf '\n[integration] Media queue depth:\n' >&2
  compose exec -T rabbitmq rabbitmqctl -q -p zglosto list_queues name messages \
    --formatter=table >&2 || true
  printf '\n[integration] Recent logs:\n' >&2
  compose logs --tail=200 >&2 || true
}

cleanup() {
  local status=$?
  trap - EXIT

  if [ "$status" -ne 0 ]; then
    diagnostics
  fi

  if [ "$KEEP_RUNNING" != "1" ]; then
    log "Stopping isolated integration environment"
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  else
    log "Leaving integration environment running (INTEGRATION_KEEP_RUNNING=1)"
  fi

  rm -rf "$BACKUP_DIR"

  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || { log 'ERROR: docker is not installed'; exit 1; }
command -v node >/dev/null 2>&1 || { log 'ERROR: node is not installed'; exit 1; }
command -v openssl >/dev/null 2>&1 || { log 'ERROR: openssl is not installed'; exit 1; }
command -v curl >/dev/null 2>&1 || { log 'ERROR: curl is not installed'; exit 1; }

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

log "Building and starting the isolated environment"
compose up --detach --build --wait --wait-timeout "$WAIT_TIMEOUT"

if [ "$REDIS_MODE" = "local" ]; then
  assert_readiness_state() {
    local payload=$1
    local service=$2
    local expected_status=$3
    local expected_redis=$4
    EXPECTED_SERVICE="$service" EXPECTED_STATUS="$expected_status" EXPECTED_REDIS="$expected_redis" \
      node -e '
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { input += chunk; });
        process.stdin.on("end", () => {
          const value = JSON.parse(input);
          const expected = {
            service: process.env.EXPECTED_SERVICE,
            status: process.env.EXPECTED_STATUS,
            redis: process.env.EXPECTED_REDIS,
          };
          for (const [field, expectedValue] of Object.entries(expected)) {
            if (value[field] !== expectedValue) {
              console.error(
                `Readiness mismatch for ${expected.service}: expected ${field}=${expectedValue}, received ${field}=${String(value[field])}. Payload: ${JSON.stringify(value)}`,
              );
              process.exit(1);
            }
          }
        });
      ' <<< "$payload"
  }

  authorization_readiness() {
    curl -fsS \
      --resolve "authorization:$AUTHORIZATION_MTLS_PORT:127.0.0.1" \
      --cacert "$ROOT_DIR/.certs/service/ca.crt" \
      --cert "$ROOT_DIR/.certs/service/authorization-healthcheck-client.crt" \
      --key "$ROOT_DIR/.certs/service/authorization-healthcheck-client.key" \
      "https://authorization:$AUTHORIZATION_MTLS_PORT/health/ready"
  }

  log "Verifying Redis outage degradation and recovery"
  assert_readiness_state \
    "$(curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health/ready")" backend ok up
  assert_readiness_state "$(authorization_readiness)" authorization ok up

  compose stop redis >/dev/null
  assert_readiness_state \
    "$(curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health/ready")" backend degraded down
  assert_readiness_state "$(authorization_readiness)" authorization degraded down
  compose exec -T backend node -e \
    "fetch('http://127.0.0.1:3000/mieszkaniec/incydenty/glowna').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

  compose up --detach --wait --wait-timeout "$WAIT_TIMEOUT" redis >/dev/null
  recovered=0
  for _attempt in $(seq 1 20); do
    backend_payload="$(curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health/ready")"
    authorization_payload="$(authorization_readiness)"
    if assert_readiness_state "$backend_payload" backend ok up >/dev/null 2>&1 &&
      assert_readiness_state "$authorization_payload" authorization ok up >/dev/null 2>&1; then
      recovered=1
      break
    fi
    sleep 1
  done
  if [ "$recovered" != "1" ]; then
    log "ERROR: applications did not recover their Redis connections"
    exit 1
  fi
  if [ "$REDIS_FAILURE_ONLY" = "1" ]; then
    log "Redis outage degradation, PostgreSQL fallback and recovery passed"
    exit 0
  fi
fi

log "Verifying the RabbitMQ TLS-only listener and foreign CA rejection"
compose exec -T rabbitmq sh -c \
  'rabbitmq-diagnostics -q listeners | grep -q "port: 5671, protocol: amqp/ssl" && ! rabbitmq-diagnostics -q listeners | grep -q "port: 5672, protocol: amqp" && ! rabbitmq-diagnostics -q listeners | grep -q "port: 15672"'
if openssl s_client \
  -connect "127.0.0.1:$RABBITMQ_TLS_PORT" \
  -servername rabbitmq \
  -CAfile "$ROOT_DIR/.certs/database/ca.crt" \
  -verify_return_error </dev/null >/dev/null 2>&1; then
  log "ERROR: RabbitMQ certificate unexpectedly validates against Database CA"
  exit 1
fi

log "Verifying the PgBouncer application boundary"
for service in authorization backend media_worker; do
  compose exec -T "$service" node -e \
    "const fs = require('node:fs'); const url = new URL(process.env.DATABASE_URL); if (url.hostname !== 'pgbouncer') process.exit(1); if (Object.hasOwn(process.env, 'DATABASE_DIRECT_URL')) process.exit(2); if (!fs.statSync(process.env.DATABASE_TLS_CA_PATH).isFile()) process.exit(3); if (fs.existsSync('/run/secrets/database/pgbouncer-server.key') || fs.existsSync('/run/secrets/database/postgres-server.key')) process.exit(4)"
done

log "Verifying the standalone media_worker boundary"
compose exec -T media_worker node dist/nest/media-worker/healthcheck.js
compose exec -T media_worker node -e \
  "if (process.env.SERVICE_NAME !== 'media_worker') process.exit(1); if (!Object.hasOwn(process.env, 'S3_ENDPOINT')) process.exit(2); if (Object.hasOwn(process.env, 'AUTH_SERVICE_URL')) process.exit(3); if (new URL(process.env.DATABASE_URL).hostname !== 'pgbouncer') process.exit(4); if (new URL(process.env.RABBITMQ_URL).protocol !== 'amqps:') process.exit(5); if (Object.keys(process.env).some((name) => name.startsWith('RUSTFS_'))) process.exit(6);"

log "Verifying TLS 1.3 on both database transport segments"
compose exec -T pgbouncer sh -c \
  'grep -qx "client_tls_sslmode = require" /etc/pgbouncer/pgbouncer.ini &&
   grep -qx "client_tls_protocols = tlsv1.3" /etc/pgbouncer/pgbouncer.ini &&
   grep -qx "server_tls_sslmode = verify-full" /etc/pgbouncer/pgbouncer.ini &&
   grep -qx "server_tls_protocols = tlsv1.3" /etc/pgbouncer/pgbouncer.ini &&
   test "$(psql -v ON_ERROR_STOP=1 "$PGBOUNCER_CLIENT_URL" -tAc "SELECT ssl::text || '\''|'\'' || version FROM pg_stat_ssl WHERE pid = pg_backend_pid()")" = "true|TLSv1.3"'
compose exec -T database sh -c \
  'test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT ssl::text || '\''|'\'' || version FROM pg_stat_ssl WHERE pid = pg_backend_pid()")" = "true|TLSv1.3"'

log "Verifying that PostgreSQL and PgBouncer reject plaintext clients"
compose exec -T database sh -c \
  'if PGSSLMODE=disable psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then exit 1; fi'
compose exec -T pgbouncer sh -c \
  'if PGSSLMODE=disable psql "$PGBOUNCER_CLIENT_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then exit 1; fi'

log "Verifying server CA and SAN rejection on database transports"
compose exec -T database sh -c '
  set -- $(getent hosts database)
  database_address=$1
  set -- $(getent hosts pgbouncer)
  pgbouncer_address=$1

  if PGHOST=wrong-database.invalid PGHOSTADDR="$database_address" PGPORT="$POSTGRES_PORT" \
    PGDATABASE="$POSTGRES_DB" PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" \
    PGSSLMODE=verify-full PGSSLROOTCERT=/run/secrets/database/ca.crt \
    psql -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then
    exit 1
  fi

  if PGHOST=database PGPORT="$POSTGRES_PORT" PGDATABASE="$POSTGRES_DB" \
    PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGSSLMODE=verify-full \
    PGSSLROOTCERT=/run/test-secrets/foreign-database-ca.crt \
    psql -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then
    exit 2
  fi

  if PGHOST=wrong-pgbouncer.invalid PGHOSTADDR="$pgbouncer_address" PGPORT=6432 \
    PGDATABASE="$POSTGRES_DB" PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" \
    PGSSLMODE=verify-full PGSSLROOTCERT=/run/secrets/database/ca.crt \
    psql -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then
    exit 3
  fi

  if PGHOST=pgbouncer PGPORT=6432 PGDATABASE="$POSTGRES_DB" PGUSER="$POSTGRES_USER" \
    PGPASSWORD="$POSTGRES_PASSWORD" PGSSLMODE=verify-full \
    PGSSLROOTCERT=/run/test-secrets/foreign-database-ca.crt \
    psql -v ON_ERROR_STOP=1 -tAc "SELECT 1" >/dev/null 2>&1; then
    exit 4
  fi
'

log "Verifying the Backend mTLS client boundary"
compose exec -T backend node -e \
  "const fs = require('node:fs'); const { X509Certificate } = require('node:crypto'); const url = new URL(process.env.AUTH_SERVICE_URL); if (url.protocol !== 'https:' || url.hostname !== 'authorization' || url.port !== '9956') process.exit(1); for (const name of ['AUTH_SERVICE_CA_PATH', 'AUTH_SERVICE_CERT_PATH', 'AUTH_SERVICE_KEY_PATH']) { if (!fs.statSync(process.env[name]).isFile()) process.exit(2); } const certificate = new X509Certificate(fs.readFileSync(process.env.AUTH_SERVICE_CERT_PATH)); if (certificate.subjectAltName !== 'URI:spiffe://zglosto.local/workload/backend') process.exit(3); if (fs.existsSync('/run/secrets/service/nginx-client.key') || fs.existsSync('/run/secrets/service/authorization-server.key')) process.exit(4);"

log "Verifying the LLM gateway mTLS and HMAC boundary"
compose exec -T backend node --input-type=module -e \
  "import fs from 'node:fs'; import https from 'node:https'; import { X509Certificate } from 'node:crypto'; const url = new URL(process.env.LLM_GATEWAY_URL); if (url.protocol !== 'https:' || url.hostname !== 'llm_gateway') process.exit(1); for (const name of ['LLM_GATEWAY_CA_PATH', 'LLM_GATEWAY_CERT_PATH', 'LLM_GATEWAY_KEY_PATH', 'LLM_GATEWAY_HMAC_KEY_FILE']) { if (!fs.statSync(process.env[name]).isFile()) process.exit(2); } const certificate = new X509Certificate(fs.readFileSync(process.env.LLM_GATEWAY_CERT_PATH)); if (certificate.subjectAltName !== 'URI:spiffe://zglosto.local/workload/backend') process.exit(3); const invoke = (authenticated) => new Promise((resolve, reject) => { const request = https.request(new URL('/classify-incident', url), { ca: fs.readFileSync(process.env.LLM_GATEWAY_CA_PATH), cert: authenticated ? fs.readFileSync(process.env.LLM_GATEWAY_CERT_PATH) : undefined, headers: { 'content-type': 'application/json' }, key: authenticated ? fs.readFileSync(process.env.LLM_GATEWAY_KEY_PATH) : undefined, method: 'QUERY', minVersion: 'TLSv1.3', servername: process.env.LLM_GATEWAY_SERVER_NAME }, (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)); }); request.on('error', reject); request.end('{}'); }); let rejected = false; try { await invoke(false); } catch { rejected = true; } if (!rejected) process.exit(4); if (await invoke(true) !== 401) process.exit(5);"

log "Verifying the Nginx mTLS client boundary"
compose exec -T nginx sh -c \
  "test -f /run/secrets/service/ca.crt && test -f /run/secrets/service/nginx-client.crt && test -f /run/secrets/service/nginx-client.key && test ! -e /run/secrets/service/backend-client.key && test ! -e /run/secrets/service/authorization-server.key && nginx -T 2>&1 | grep -q 'proxy_pass https://authorization:9956/api/auth/' && nginx -T 2>&1 | grep -q 'proxy_pass https://llm_gateway:8130/health'"

log "Verifying the Authorization mTLS-only healthcheck boundary"
compose exec -T authorization node -e \
  "const fs = require('node:fs'); const { X509Certificate } = require('node:crypto'); const certificate = new X509Certificate(fs.readFileSync(process.env.AUTHORIZATION_HEALTHCHECK_CERT_PATH)); if (certificate.subjectAltName !== 'URI:spiffe://zglosto.local/workload/authorization-healthcheck') process.exit(1); if (fs.existsSync('/run/secrets/service/backend-client.key') || fs.existsSync('/run/secrets/service/nginx-client.key')) process.exit(2);"

log "Verifying pgBackRest stanza, WAL archive and initial full backup"
compose exec -T database sh -c \
  'gosu postgres pgbackrest --stanza=zglosto_db --pg1-port="$POSTGRES_PORT" --pg1-user="$POSTGRES_USER" check'
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -c "SELECT perform_differential_backup()"' \
  >/dev/null
compose exec -T database sh -c \
  'gosu postgres pgbackrest --stanza=zglosto_db info --output=json' \
  | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const stanzas = JSON.parse(input);
        if (!Array.isArray(stanzas) || stanzas.length !== 1) process.exit(1);
        const backups = stanzas[0]?.backup;
        if (!Array.isArray(backups) || !backups.some((backup) => backup.type === "full")) process.exit(2);
        if (!backups.some((backup) => backup.type === "diff")) process.exit(3);
      });
    '

log "Verifying the neutral S3 Object Storage boundary"
compose exec -T backend node -e \
  "if (new URL(process.env.S3_ENDPOINT).hostname !== 'rustfs') process.exit(1); if (Object.keys(process.env).some((name) => name.startsWith('RUSTFS_'))) process.exit(2)"
compose exec -T backend node dist/storage/verify-storage.js

log "Reapplying migrations to verify idempotence"
for migration in "$ROOT_DIR"/database/migrations/*.sql; do
  compose exec -T database sh -c \
    'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
    < "$migration" >/dev/null
done

compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "
    SELECT CASE
      WHEN to_regclass('\''public.incident_images'\'') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = '\''public'\''
           AND table_name = '\''incydenty'\''
           AND column_name IN ('\''zdjecie_incydentu_zglaszanego'\'', '\''zdjecie_incydentu_rozwiazanego'\'')
       )
      THEN 1 ELSE 0 END
  "' | grep -qx '1'

log "Verifying the partial index for the public resolved-incident query"
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "
    SELECT to_regclass('\''public.idx_incydenty_public_resolved_order'\'') IS NOT NULL
  "' | grep -qx 't'
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -c "
    SET enable_seqscan = off;
    EXPLAIN (COSTS OFF)
    SELECT id_zgloszenia
    FROM incydenty
    WHERE status_incydentu = '\''resolved'\''
    ORDER BY data_rozwiazania DESC NULLS LAST,
             godzina_rozwiazania DESC NULLS LAST,
             id_zgloszenia DESC
    LIMIT 15
  "' | grep -q 'idx_incydenty_public_resolved_order'

log "Running Phase 0 API scenarios"
INTEGRATION_BASE_URL="http://127.0.0.1:$HTTP_PORT" \
  node "$ROOT_DIR/tests/integration/phase0.integration.ts"

log "Verifying the active 22-route NestJS contract, structured errors and OpenAPI through Nginx"
INTEGRATION_BACKEND_RUNTIME=nest \
INTEGRATION_PUBLIC_API_PREFIX=/api \
INTEGRATION_BASE_URL="http://127.0.0.1:$HTTP_PORT" \
  node "$ROOT_DIR/tests/integration/backend-http-contract.integration.ts"

log "Waiting for the isolated Better Auth rate-limit window between test suites"
sleep 11

log "Running frozen Phase 5 authorization contract"
INTEGRATION_BASE_URL="http://127.0.0.1:$HTTP_PORT" \
INTEGRATION_AUTHORIZATION_URL="https://127.0.0.1:$AUTHORIZATION_MTLS_PORT" \
INTEGRATION_CERTIFICATES_DIRECTORY="$ROOT_DIR/.certs" \
  node "$ROOT_DIR/tests/integration/authorization-contract.integration.ts"

log "Verifying the Authorization mTLS listener and workload identities"
INTEGRATION_AUTHORIZATION_MTLS_PORT="$AUTHORIZATION_MTLS_PORT" \
INTEGRATION_CERTIFICATES_DIRECTORY="$ROOT_DIR/.certs" \
  node "$ROOT_DIR/tests/integration/authorization-mtls.integration.ts"

log "Verifying transactional media jobs and outbox payloads"
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
  < "$ROOT_DIR/tests/integration/media-outbox.sql" >/dev/null

publish_outbox_once() {
  compose exec -T backend node --input-type=module -e \
    "import { NestFactory } from '@nestjs/core'; import { AppModule } from './dist/nest/app.module.js'; import { OutboxPublisherService } from './dist/nest/modules/jobs/outbox-publisher.service.js'; const app = await NestFactory.createApplicationContext(AppModule, { logger: false }); await app.get(OutboxPublisherService).tickOnce(); await app.close();"
}

log "Stopping media_worker to build a bounded queue backlog"
compose stop media_worker >/dev/null

log "Publishing PostgreSQL outbox only after RabbitMQ publisher confirms"
publish_outbox_once
queue_topology="$(compose exec -T rabbitmq rabbitmqctl -p zglosto list_queues name durable type --formatter=table)"
grep -E '^zglosto\.(media|llm)\..*[[:space:]]true[[:space:]]quorum$' \
  <<< "$queue_topology" >/dev/null
log "RabbitMQ durable quorum topology is present"
ready_queue_depth="0"
for _ in $(seq 1 10); do
  ready_queue_depth="$(compose exec -T rabbitmq rabbitmqctl -q -p zglosto list_queues name messages_ready \
    --formatter=json | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const queue = JSON.parse(input).find(({name}) => name === "zglosto.media.process.v1"); process.stdout.write(String(queue?.messages_ready ?? -1)); });')"
  [ "$ready_queue_depth" = "6" ] && break
  sleep 1
done
if [ "$ready_queue_depth" != "6" ]; then
  log "ERROR: expected a six-message media backlog, got $ready_queue_depth"
  exit 1
fi
log "Starting media_worker and draining the queued backlog"
compose up --detach --wait --wait-timeout "$WAIT_TIMEOUT" media_worker >/dev/null
consumer_prefetch="$(compose exec -T rabbitmq rabbitmqctl -q -p zglosto list_consumers queue_name prefetch_count \
  --formatter=json | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const consumer = JSON.parse(input).find(({queue_name: queueName}) => queueName === "zglosto.media.process.v1"); process.stdout.write(String(consumer?.prefetch_count ?? -1)); });')"
if [ "$consumer_prefetch" != "1" ]; then
  log "ERROR: media_worker consumer prefetch is not bounded to 1: $consumer_prefetch"
  exit 1
fi
compose exec -T database sh -c \
  'test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM outbox_events WHERE status NOT IN ('\''published'\'', '\''discarded'\'') OR (status = '\''published'\'' AND published_at IS NULL)")" = "0"'
log "All claimed outbox records are published"
compose exec -T database sh -c \
  'test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM media_processing_jobs WHERE status NOT IN ('\''published'\'', '\''processing'\'', '\''succeeded'\'', '\''superseded'\'')")" = "0"'
for _ in $(seq 1 30); do
  remaining_jobs="$(compose exec -T database sh -c \
    'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM media_processing_jobs WHERE status NOT IN ('\''succeeded'\'', '\''superseded'\'')"')"
  [ "$remaining_jobs" = "0" ] && break
  sleep 1
done
compose exec -T database sh -c \
  'test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM media_processing_jobs WHERE status NOT IN ('\''succeeded'\'', '\''superseded'\'')")" = "0" && test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM incident_images WHERE status <> '\''ready'\'' OR processed_mime_type <> '\''image/webp'\'' OR processed_object_key IS NULL OR original_deleted_at IS NULL")" = "0"'
log "All active media jobs produced WebP objects and removed their originals"

IFS='|' read -r processed_key original_key processed_checksum processed_width processed_height <<< "$(compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tA -F "|" -c "SELECT processed_object_key, original_object_key, processed_checksum_sha256, width, height FROM incident_images WHERE status = '\''ready'\'' ORDER BY created_at LIMIT 1"')"
compose exec -T \
  -e PROCESSED_KEY="$processed_key" \
  -e ORIGINAL_KEY="$original_key" \
  -e PROCESSED_CHECKSUM="$processed_checksum" \
  -e PROCESSED_WIDTH="$processed_width" \
  -e PROCESSED_HEIGHT="$processed_height" \
  media_worker node --input-type=module -e \
  "import { createHash } from 'node:crypto'; import sharp from 'sharp'; import { validateObjectStorageEnvironment } from './dist/config/env.js'; import { S3ObjectStorage } from './dist/storage/s3-object-storage.js'; const storage = new S3ObjectStorage(validateObjectStorageEnvironment()); await storage.initialize(); const object = await storage.getObject(process.env.PROCESSED_KEY); const metadata = await sharp(object.body).metadata(); const checksum = createHash('sha256').update(object.body).digest('hex'); if (object.contentType !== 'image/webp' || checksum !== process.env.PROCESSED_CHECKSUM || object.checksumSha256 !== checksum) process.exit(1); if (metadata.format !== 'webp' || String(metadata.width) !== process.env.PROCESSED_WIDTH || String(metadata.height) !== process.env.PROCESSED_HEIGHT || metadata.width > 2000 || metadata.height > 2000) process.exit(2); if (metadata.exif || metadata.icc || metadata.xmp) process.exit(3); if (await storage.objectExists(process.env.ORIGINAL_KEY)) process.exit(4); await storage.close();"

log "Verifying media retry, terminal DLQ and idempotent receipt"
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
  < "$ROOT_DIR/tests/integration/media-worker-retry.sql" >/dev/null
publish_outbox_once
for _ in $(seq 1 20); do
  retry_state="$(compose exec -T database sh -c \
    'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT status::text FROM media_processing_jobs WHERE id = '\''019f67c6-ee5c-7270-afa1-cacee418a003'\''"')"
  [ "$retry_state" = "dead_lettered" ] && break
  sleep 1
done
retry_result="$(compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT job.status::text || '\''|'\'' || job.attempt_count || '\''|'\'' || job.last_failure_code || '\''|'\'' || image.status::text || '\''|'\'' || image.failure_code || '\''|'\'' || (SELECT count(*) FROM consumed_messages WHERE consumer_name = '\''media-worker-v1'\'' AND message_id = '\''019f67c6-ee5c-7270-afa1-cacee418a004'\'') FROM media_processing_jobs job JOIN incident_images image ON image.id = job.image_id WHERE job.id = '\''019f67c6-ee5c-7270-afa1-cacee418a003'\''"')"
if [ "$retry_result" != "dead_lettered|2|storage_read_failed|failed|storage_read_failed|1" ]; then
  log "ERROR: unexpected media retry result: $retry_result"
  exit 1
fi
dlq_messages="0"
for _ in $(seq 1 10); do
  dlq_messages="$(compose exec -T rabbitmq rabbitmqctl -q -p zglosto list_queues name messages \
    --formatter=json | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const queue = JSON.parse(input).find(({name}) => name === "zglosto.media.process.dlq.v1"); process.stdout.write(String(queue?.messages ?? -1)); });')"
  [ "$dlq_messages" = "1" ] && break
  sleep 1
done
if [ "$dlq_messages" != "1" ]; then
  log "ERROR: unexpected media DLQ depth: $dlq_messages"
  exit 1
fi
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -c "DELETE FROM consumed_messages WHERE consumer_name = '\''media-worker-v1'\'' AND message_id = '\''019f67c6-ee5c-7270-afa1-cacee418a004'\''; DELETE FROM incydenty WHERE id_zgloszenia = '\''019f67c6-ee5c-7270-afa1-cacee418a001'\'';"' \
  >/dev/null
compose exec -T rabbitmq rabbitmqctl -q -p zglosto purge_queue \
  zglosto.media.process.dlq.v1 >/dev/null

log "Verifying outbox recovery while RabbitMQ is unavailable"
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -c "UPDATE outbox_events SET status = '\''pending'\'', published_at = NULL, available_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM outbox_events WHERE status = '\''published'\'' ORDER BY created_at LIMIT 1)"' >/dev/null
compose stop rabbitmq >/dev/null
for _ in $(seq 1 20); do
  if ! compose exec -T media_worker node dist/nest/media-worker/healthcheck.js >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if compose exec -T media_worker node dist/nest/media-worker/healthcheck.js >/dev/null 2>&1; then
  log "ERROR: media_worker remained ready without RabbitMQ"
  exit 1
fi
publish_outbox_once
compose exec -T database sh -c \
  'test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM outbox_events WHERE status = '\''failed'\'' AND last_error_code = '\''broker_publish_failed'\''")" = "1"'
compose up --detach --wait --wait-timeout "$WAIT_TIMEOUT" rabbitmq >/dev/null
for _ in $(seq 1 30); do
  if compose exec -T media_worker node dist/nest/media-worker/healthcheck.js >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
compose exec -T media_worker node dist/nest/media-worker/healthcheck.js
publish_outbox_once
compose exec -T database sh -c \
  'test "$(psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM outbox_events WHERE status NOT IN ('\''published'\'', '\''discarded'\'') OR (status = '\''published'\'' AND published_at IS NULL)")" = "0"'

log "Verifying optional incident coordinates and database range guards"
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
  < "$ROOT_DIR/tests/integration/incident-location.sql" >/dev/null

log "Verifying inactive service history and assignment guards"
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL"' \
  < "$ROOT_DIR/tests/integration/inactive-service-history.sql" >/dev/null

log "Creating a consistent PostgreSQL and Object Storage backup"
"$ROOT_DIR/scripts/backup-compose.sh" "$BACKUP_DIR" "${COMPOSE[@]:2}"

incident_count_before_restore="$(compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM incydenty"')"
object_key_to_restore="$(compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT processed_object_key FROM incident_images WHERE status = '\''ready'\'' ORDER BY created_at LIMIT 1"')"
[ -n "$object_key_to_restore" ]

log "Simulating loss of database rows and an Object Storage object"
compose exec -T -e "RESTORE_TEST_OBJECT_KEY=$object_key_to_restore" backend node --input-type=module -e \
  "import { validateBackendEnvironment } from './dist/config/env.js'; import { S3ObjectStorage } from './dist/storage/s3-object-storage.js'; const storage = new S3ObjectStorage(validateBackendEnvironment().objectStorage); await storage.deleteObject(process.env.RESTORE_TEST_OBJECT_KEY);"
compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -c "TRUNCATE incydenty CASCADE"' >/dev/null

log "Restoring PostgreSQL and Object Storage, then checking referential consistency"
"$ROOT_DIR/scripts/restore-compose.sh" "$BACKUP_DIR" "${COMPOSE[@]:2}"

incident_count_after_restore="$(compose exec -T database sh -c \
  'psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM incydenty"')"
[ "$incident_count_after_restore" = "$incident_count_before_restore" ]
compose exec -T -e "RESTORE_TEST_OBJECT_KEY=$object_key_to_restore" backend node --input-type=module -e \
  "import { validateBackendEnvironment } from './dist/config/env.js'; import { S3ObjectStorage } from './dist/storage/s3-object-storage.js'; const storage = new S3ObjectStorage(validateBackendEnvironment().objectStorage); if (!(await storage.objectExists(process.env.RESTORE_TEST_OBJECT_KEY))) process.exit(1);"

log "Verifying graceful NestJS shutdown after removing the legacy Express runtime"
backend_container_id="$(compose ps --all --quiet backend)"
[ -n "$backend_container_id" ]
compose stop --timeout 30 backend >/dev/null
test "$(docker inspect --format '{{.State.ExitCode}}' "$backend_container_id")" = "0"
compose up --detach --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" backend >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$HTTP_PORT/api/protected")" = "404"
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$HTTP_PORT/api/openapi.json")" = "200"
