#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_DIR="${PHASE12_ARTIFACT_DIR:-$ROOT_DIR/.state/phase-12/resources/${TIMESTAMP}-${PROFILE}}"
PROJECT_NAME="zglosto-phase12-resource-${PROFILE}"
MONITOR_PID=
MONITOR_STOPPED=0

fail() {
  printf '[phase-12-resource] ERROR: %s\n' "$*" >&2
  exit 1
}

case "$PROFILE" in
  minimal)
    REDIS_MODE=disabled
    HTTP_PORT="${INTEGRATION_HTTP_PORT:-12535}"
    ;;
  recommended)
    REDIS_MODE=local
    HTTP_PORT="${INTEGRATION_HTTP_PORT:-12536}"
    ;;
  observability)
    REDIS_MODE=disabled
    HTTP_PORT="${INTEGRATION_HTTP_PORT:-12537}"
    ;;
  *)
    fail 'usage: phase12-resource-profile.sh minimal|recommended|observability'
    ;;
esac

[ "${PHASE12_ALLOW_DESTRUCTIVE:-0}" = '1' ] ||
  fail 'set PHASE12_ALLOW_DESTRUCTIVE=1 only for the isolated resource test'

# Resource sizing measures application throughput, not the separately tested limiter threshold.
export INCIDENT_IP_RATE_LIMIT_MAX_REQUESTS="${INCIDENT_IP_RATE_LIMIT_MAX_REQUESTS:-100}"
export INCIDENT_USER_RATE_LIMIT_MAX_REQUESTS="${INCIDENT_USER_RATE_LIMIT_MAX_REQUESTS:-100}"
export INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS="${INCIDENT_GLOBAL_RATE_LIMIT_MAX_REQUESTS:-1000}"

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ROOT_DIR/tests/integration/integration.env" \
    --file "$ROOT_DIR/docker-compose.no-rustfs.yml" \
    --file "$ROOT_DIR/docker-compose.rustfs.yml" \
    --file "$ROOT_DIR/docker-compose.integration.yml" \
    "$@"
}

stop_monitor() {
  if [ "$MONITOR_STOPPED" = '1' ] || [ -z "$MONITOR_PID" ]; then
    return
  fi
  if kill -0 "$MONITOR_PID" >/dev/null 2>&1; then
    kill -INT "$MONITOR_PID"
  fi
  wait "$MONITOR_PID" || true
  MONITOR_STOPPED=1
}

cleanup() {
  stop_monitor
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}

drain_media_jobs() {
  local active_jobs
  for _attempt in $(seq 1 60); do
    compose exec -T backend node --input-type=module -e \
      "import { NestFactory } from '@nestjs/core'; import { AppModule } from './dist/nest/app.module.js'; import { OutboxPublisherService } from './dist/nest/modules/jobs/outbox-publisher.service.js'; const app = await NestFactory.createApplicationContext(AppModule, { logger: false }); await app.get(OutboxPublisherService).tickOnce(); await app.close();"
    active_jobs="$(
      compose exec -T database sh -c \
        'psql "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM media_processing_jobs WHERE status IN ('"'"'pending'"'"', '"'"'processing'"'"');"' \
        | tr -d '[:space:]'
    )"
    if [ "$active_jobs" = '0' ]; then
      return
    fi
    sleep 1
  done
  fail 'media_worker did not drain resource-test jobs in 60 seconds'
}

mkdir -p "$ARTIFACT_DIR"
chmod 0700 "$ARTIFACT_DIR"
exec > >(tee "$ARTIFACT_DIR/run.log") 2>&1
trap cleanup EXIT INT TERM

monitor_arguments=(
  "$ROOT_DIR/scripts/phase12-resource-monitor.ts"
  --project "$PROJECT_NAME"
  --profile "$PROFILE"
  --output "$ARTIFACT_DIR/resources.json"
  --duration-seconds "${PHASE12_RESOURCE_DURATION_SECONDS:-1800}"
  --exclude-service model_runner_stub
)
if [ "$PROFILE" = 'minimal' ]; then
  monitor_arguments+=(--include-name docker-model-runner)
fi
node "${monitor_arguments[@]}" &
MONITOR_PID=$!

if [ "$PROFILE" = 'observability' ]; then
  PHASE12_ALLOW_DESTRUCTIVE=1 \
    PHASE12_OBSERVABILITY_PROJECT="$PROJECT_NAME" \
    PHASE12_OBSERVABILITY_HTTP_PORT="$HTTP_PORT" \
    PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/observability-local.json" \
    node "$ROOT_DIR/scripts/phase12-observability-drill.ts"

  stop_monitor
  trap - EXIT INT TERM
  compose down --volumes --remove-orphans
  printf '[phase-12-resource] Completed %s; evidence: %s\n' "$PROFILE" "$ARTIFACT_DIR"
  exit
fi

INTEGRATION_PROJECT_NAME="$PROJECT_NAME" \
  INTEGRATION_HTTP_PORT="$HTTP_PORT" \
  INTEGRATION_KEEP_RUNNING=1 \
  INTEGRATION_REDIS_MODE="$REDIS_MODE" \
  "$ROOT_DIR/scripts/test-phase0-integration.sh"

PHASE12_BASE_URL="http://127.0.0.1:$HTTP_PORT" \
  PHASE12_LOAD_SCENARIO=public-read \
  PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/load-public-read.json" \
  node "$ROOT_DIR/scripts/phase12-load-test.ts"

PHASE12_BASE_URL="http://127.0.0.1:$HTTP_PORT" \
  PHASE12_LOAD_SCENARIO=incident-write \
  PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/load-incident-write.json" \
  node "$ROOT_DIR/scripts/phase12-load-test.ts"

drain_media_jobs

if [ "$PROFILE" = 'minimal' ]; then
  PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/dmr.json" \
    node "$ROOT_DIR/scripts/phase12-dmr-test.ts"
fi

sleep "${PHASE12_RESOURCE_SETTLE_SECONDS:-10}"
stop_monitor
trap - EXIT INT TERM
compose down --volumes --remove-orphans

printf '[phase-12-resource] Completed %s; evidence: %s\n' "$PROFILE" "$ARTIFACT_DIR"
