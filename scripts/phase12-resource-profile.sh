#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_DIR="${PHASE12_ARTIFACT_DIR:-$ROOT_DIR/.state/phase-12/resources/${TIMESTAMP}-${PROFILE}}"
PROJECT_NAME="zglosto-phase12-resource-${PROFILE}"
MONITOR_PID=
MONITOR_DIR=

fail() {
  printf '[phase-12-resource] ERROR: %s\n' "$*" >&2
  exit 1
}

case "$PROFILE" in
  minimal)
    HTTP_PORT="${INTEGRATION_HTTP_PORT:-12535}"
    ;;
  recommended)
    HTTP_PORT="${INTEGRATION_HTTP_PORT:-12536}"
    ;;
  observability)
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

source "$ROOT_DIR/scripts/lib/phase12-integration-redis.sh"
source "$ROOT_DIR/scripts/lib/phase12-media.sh"
export INTEGRATION_PROJECT_NAME="$PROJECT_NAME" INTEGRATION_HTTP_PORT="$HTTP_PORT"

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ROOT_DIR/tests/integration/integration.env" \
    --file "$ROOT_DIR/docker-compose.no-rustfs.yml" \
    --file "$ROOT_DIR/docker-compose.rustfs.yml" \
    --file "$ROOT_DIR/docker-compose.integration.yml" \
    --file "$ROOT_DIR/docker-compose.redis.local.yml" \
    "$@"
}

stop_monitor() {
  if [ -z "$MONITOR_PID" ]; then return 0; fi
  # The monitor writes its final report on SIGTERM, or when its deadline elapses.
  kill -TERM "$MONITOR_PID" 2>/dev/null || true
  local pid=$MONITOR_PID
  MONITOR_PID=
  wait "$pid"
}

cleanup() {
  stop_monitor || true
  if [ -n "$MONITOR_DIR" ]; then rm -rf -- "$MONITOR_DIR"; fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}

finish_measurement() {
  stop_monitor || fail 'resource monitor exited unsuccessfully'
  bun -e '
    import { readFileSync } from "node:fs";
    const [file, project, profile] = process.argv.slice(1);
    const report = JSON.parse(readFileSync(file, "utf8"));
    if (report.schemaVersion !== 1 || report.kind !== "local-resource-measurement" ||
        report.project !== project || report.profile !== profile ||
        report.completion !== "signal" ||
        !Number.isSafeInteger(report.samples) || report.samples <= 0 ||
        !Array.isArray(report.containers) || report.containers.length === 0) {
      throw new Error("Invalid resource measurement");
    }
    if (profile === "minimal" &&
        !report.containers.some(({ name }) => name === "docker-model-runner")) {
      throw new Error("Docker Model Runner was not sampled");
    }
  ' "$MONITOR_DIR/resources.json" "$PROJECT_NAME" "$PROFILE" ||
    fail 'resource monitor did not produce a valid report for this run'
  mv -f "$MONITOR_DIR/resources.json" "$ARTIFACT_DIR/resources.json"
  rmdir "$MONITOR_DIR"
  MONITOR_DIR=
  compose down --volumes --remove-orphans
  trap - EXIT INT TERM
  printf '[phase-12-resource] Completed %s; evidence: %s\n' "$PROFILE" "$ARTIFACT_DIR"
}

mkdir -p "$ARTIFACT_DIR"
chmod 0700 "$ARTIFACT_DIR"
run_profile() {
  MONITOR_DIR=$(mktemp -d "$ARTIFACT_DIR/.monitor.XXXXXX")
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  monitor_arguments=(
    "$ROOT_DIR/scripts/phase12-resource-monitor.ts"
    --project "$PROJECT_NAME"
    --profile "$PROFILE"
    --output "$MONITOR_DIR/resources.json"
    --duration-seconds "${PHASE12_RESOURCE_DURATION_SECONDS:-1800}"
    --exclude-service model_runner_stub
  )
  if [ "$PROFILE" = 'minimal' ]; then
    monitor_arguments+=(--include-name docker-model-runner)
  fi
  bun "${monitor_arguments[@]}" &
  MONITOR_PID=$!

  if [ "$PROFILE" = 'observability' ]; then
    PHASE12_ALLOW_DESTRUCTIVE=1 \
      PHASE12_OBSERVABILITY_PROJECT="$PROJECT_NAME" \
      PHASE12_OBSERVABILITY_HTTP_PORT="$HTTP_PORT" \
      PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/observability-local.json" \
      bun "$ROOT_DIR/scripts/phase12-observability-drill.ts"

    finish_measurement
    return
  fi

  INTEGRATION_KEEP_RUNNING=1 \
    INTEGRATION_REDIS_MODE=local \
    "$ROOT_DIR/scripts/test-phase0-integration.sh"

  PHASE12_BASE_URL="http://127.0.0.1:$HTTP_PORT" \
    PHASE12_LOAD_SCENARIO=public-read \
    PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/load-public-read.json" \
    bun "$ROOT_DIR/scripts/phase12-load-test.ts"

  PHASE12_BASE_URL="http://127.0.0.1:$HTTP_PORT" \
    PHASE12_LOAD_SCENARIO=incident-write \
    PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/load-incident-write.json" \
    bun "$ROOT_DIR/scripts/phase12-load-test.ts"

  verify_phase12_media_jobs "$ARTIFACT_DIR/load-incident-write.json" compose

  if [ "$PROFILE" = 'minimal' ]; then
    PHASE12_EVIDENCE_FILE="$ARTIFACT_DIR/dmr.json" \
      bun "$ROOT_DIR/scripts/phase12-dmr-test.ts"
  fi

  sleep "${PHASE12_RESOURCE_SETTLE_SECONDS:-10}"
  finish_measurement
}

run_profile 2>&1 | tee "$ARTIFACT_DIR/run.log"
