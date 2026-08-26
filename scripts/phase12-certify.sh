#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${PHASE12_ARTIFACT_DIR:-$ROOT_DIR/.state/phase-12/$(date -u +%Y%m%dT%H%M%SZ)}"
INTEGRATION_PROJECT_NAME="${INTEGRATION_PROJECT_NAME:-zglosto-phase12}"
INTEGRATION_HTTP_PORT="${INTEGRATION_HTTP_PORT:-12335}"

log() {
  printf '[phase-12] %s\n' "$*"
}

fail() {
  printf '[phase-12] ERROR: %s\n' "$*" >&2
  exit 1
}

require_destructive_guard() {
  [ "${PHASE12_ALLOW_DESTRUCTIVE:-0}" = '1' ] ||
    fail 'set PHASE12_ALLOW_DESTRUCTIVE=1 only on a disposable certification environment'
}

prepare_artifacts() {
  mkdir -p "$ARTIFACT_DIR"
  chmod 0700 "$ARTIFACT_DIR"
}

static_gate() {
  cd "$ROOT_DIR"
  CI=true pnpm check
}

host_gate() {
  prepare_artifacts
  PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/host.json" \
    node "$ROOT_DIR/scripts/phase12-host-audit.ts"
}

dmr_gate() {
  prepare_artifacts
  PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/dmr.json" \
    node "$ROOT_DIR/scripts/phase12-dmr-test.ts"
}

public_edge_gate() {
  prepare_artifacts
  [ -n "${PHASE12_PUBLIC_BASE_URL:-}" ] ||
    fail 'edge requires PHASE12_PUBLIC_BASE_URL=https://the-real-domain'
  PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/public-edge.json" \
    node "$ROOT_DIR/scripts/phase12-public-edge-test.ts"
}

soak_gate() {
  prepare_artifacts
  [ -n "${PHASE12_BASE_URL:-}" ] ||
    fail 'soak requires PHASE12_BASE_URL pointing at the acceptance deployment'
  PHASE12_LOAD_SCENARIO=public-read \
    PHASE12_LOAD_DURATION_SECONDS="${PHASE12_SOAK_DURATION_SECONDS:-3600}" \
    PHASE12_LOAD_CONCURRENCY="${PHASE12_SOAK_CONCURRENCY:-20}" \
    PHASE12_LOAD_PACING_MS="${PHASE12_SOAK_PACING_MS:-50}" \
    PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/soak-public-read.json" \
    node "$ROOT_DIR/scripts/phase12-load-test.ts"
}

observability_gate() {
  require_destructive_guard
  prepare_artifacts
  PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/observability-local.json" \
    node "$ROOT_DIR/scripts/phase12-observability-drill.ts"
}

integration_gate() {
  local redis_mode=$1
  require_destructive_guard
  prepare_artifacts
  INTEGRATION_PROJECT_NAME="${INTEGRATION_PROJECT_NAME}-${redis_mode}" \
    INTEGRATION_HTTP_PORT="$INTEGRATION_HTTP_PORT" \
    INTEGRATION_REDIS_MODE="$redis_mode" \
    "$ROOT_DIR/scripts/test-phase0-integration.sh" \
    2>&1 | tee "$ARTIFACT_DIR/integration-${redis_mode}.log"
}

cleanup_load_environment() {
  phase12_load_compose \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
}

phase12_load_compose() {
  docker compose \
    --project-name "${INTEGRATION_PROJECT_NAME}-load" \
    --env-file "$ROOT_DIR/tests/integration/integration.env" \
    --file "$ROOT_DIR/docker-compose.no-rustfs.yml" \
    --file "$ROOT_DIR/docker-compose.rustfs.yml" \
    --file "$ROOT_DIR/docker-compose.integration.yml" \
    "$@"
}

load_gate() {
  require_destructive_guard
  prepare_artifacts
  trap cleanup_load_environment EXIT INT TERM
  INTEGRATION_PROJECT_NAME="${INTEGRATION_PROJECT_NAME}-load" \
    INTEGRATION_HTTP_PORT="$INTEGRATION_HTTP_PORT" \
    INTEGRATION_KEEP_RUNNING=1 \
    INTEGRATION_REDIS_MODE=disabled \
    "$ROOT_DIR/scripts/test-phase0-integration.sh" \
    2>&1 | tee "$ARTIFACT_DIR/integration-load.log"
  PHASE12_BASE_URL="http://127.0.0.1:$INTEGRATION_HTTP_PORT" \
    PHASE12_LOAD_SCENARIO=public-read \
    PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/load-public-read.json" \
    node "$ROOT_DIR/scripts/phase12-load-test.ts"
  PHASE12_BASE_URL="http://127.0.0.1:$INTEGRATION_HTTP_PORT" \
    PHASE12_LOAD_SCENARIO=incident-write \
    PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/load-incident-write.json" \
    node "$ROOT_DIR/scripts/phase12-load-test.ts"
  media_drained=0
  for _attempt in $(seq 1 60); do
    phase12_load_compose exec -T backend node --input-type=module -e \
      "import { NestFactory } from '@nestjs/core'; import { AppModule } from './dist/nest/app.module.js'; import { OutboxPublisherService } from './dist/nest/modules/jobs/outbox-publisher.service.js'; const app = await NestFactory.createApplicationContext(AppModule, { logger: false }); await app.get(OutboxPublisherService).tickOnce(); await app.close();"
    active_jobs="$(
      phase12_load_compose exec -T database sh -c \
        'psql "$DATABASE_DIRECT_URL" -tAc "SELECT count(*) FROM media_processing_jobs WHERE status IN ('"'"'pending'"'"', '"'"'processing'"'"');"' \
        | tr -d '[:space:]'
    )"
    if [ "$active_jobs" = '0' ]; then
      media_drained=1
      break
    fi
    sleep 1
  done
  [ "$media_drained" = '1' ] || fail 'media_worker did not drain incident-write jobs in 60 s'
  cleanup_load_environment
  trap - EXIT INT TERM
}

production_runtime_gate() {
  require_destructive_guard
  [ "${PHASE12_HOST_KIND:-}" = 'ubuntu-production' ] ||
    fail 'production-runtime requires PHASE12_HOST_KIND=ubuntu-production'
  host_gate
  PRODUCTION_GATE_RUNTIME=1 "$ROOT_DIR/scripts/production-release-gate.sh" runtime
}

case "${1:-}" in
  static)
    static_gate
    ;;
  host)
    host_gate
    ;;
  dmr)
    dmr_gate
    ;;
  edge)
    public_edge_gate
    ;;
  soak)
    soak_gate
    ;;
  observability)
    observability_gate
    ;;
  integration-minimal)
    integration_gate disabled
    ;;
  integration-recommended)
    integration_gate local
    ;;
  load)
    load_gate
    ;;
  production-runtime)
    production_runtime_gate
    ;;
  local-all)
    static_gate
    host_gate
    dmr_gate
    integration_gate disabled
    integration_gate local
    load_gate
    ;;
  *)
    printf '%s\n' \
      'Usage: phase12-certify.sh COMMAND' \
      'Commands:' \
      '  static                   full repository quality gate' \
      '  host                     capture reference-host evidence' \
      '  dmr                      test real Gemma 3 1B through Docker Model Runner' \
      '  edge                     verify real DNS, public TLS, HSTS and public probes' \
      '  soak                     run the 60-minute acceptance soak against PHASE12_BASE_URL' \
      '  observability            run isolated metric -> trace -> log and failure drill' \
      '  integration-minimal      destructive isolated RustFS + LLM-stub profile drill' \
      '  integration-recommended  destructive isolated RustFS + Redis profile drill' \
      '  load                     destructive public-read, incident-write and media-drain load test' \
      '  production-runtime       guarded real production deploy/restart/backup drill' \
      '  local-all                run every locally available gate'
    exit 64
    ;;
esac

log "Completed ${1:-unknown}; evidence directory: $ARTIFACT_DIR"
