#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:-check}"
PROJECT_NAME="${MOBILE_DEMO_PROJECT_NAME:-zglosto-mobile-demo}"
ENV_FILE="${MOBILE_DEMO_ENV_FILE:-$ROOT_DIR/.env.example}"
WAIT_TIMEOUT="${MOBILE_DEMO_WAIT_TIMEOUT:-240}"
DOCKER_CONTEXT_NAME="${MOBILE_DEMO_DOCKER_CONTEXT:-}"
HTTP_PORT="${MOBILE_DEMO_HTTP_PORT:-1236}"

[[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && [ "$HTTP_PORT" -ge 1024 ] && [ "$HTTP_PORT" -le 65535 ] || {
  printf '[mobile-demo] ERROR: MOBILE_DEMO_HTTP_PORT must be an unprivileged TCP port.\n' >&2
  exit 1
}

export MOBILE_DEMO_HTTP_PORT="$HTTP_PORT"
export BETTER_AUTH_URL="http://localhost:$HTTP_PORT"
export FRONTEND_ORIGIN="http://localhost:$HTTP_PORT"
export S3_PUBLIC_ENDPOINT="http://uploads.127.0.0.1.nip.io:$HTTP_PORT"

case "$PROJECT_NAME" in
  zglosto-mobile-demo*) ;;
  *)
    printf '[mobile-demo] ERROR: MOBILE_DEMO_PROJECT_NAME must start with zglosto-mobile-demo.\n' >&2
    exit 1
    ;;
esac

docker_cli() {
  if [ -n "$DOCKER_CONTEXT_NAME" ]; then
    docker --context "$DOCKER_CONTEXT_NAME" "$@"
  else
    docker "$@"
  fi
}

compose() {
  docker_cli compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    --file "$ROOT_DIR/docker-compose.yml" \
    --file "$ROOT_DIR/Mobile/docker-compose.demo.yml" \
    "$@"
}

resolve_docker_context() {
  if [ -n "$DOCKER_CONTEXT_NAME" ]; then
    docker_cli info >/dev/null 2>&1 || fail "Docker context $DOCKER_CONTEXT_NAME is unavailable"
    return
  fi
  if docker info >/dev/null 2>&1; then return; fi
  if docker --context orbstack info >/dev/null 2>&1; then
    DOCKER_CONTEXT_NAME=orbstack
    log 'Using available OrbStack Docker context.'
    return
  fi
  fail 'Docker daemon is unavailable; start Docker Desktop or OrbStack'
}

log() {
  printf '[mobile-demo] %s\n' "$*"
}

fail() {
  printf '[mobile-demo] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

check_environment() {
  require_command node
  require_command pnpm
  require_command docker
  require_command curl
  require_command openssl
  require_command java

  resolve_docker_context

  [ -f "$ENV_FILE" ] || fail "Missing environment file: $ENV_FILE"
  [ -f "$ROOT_DIR/Mobile/.env.example" ] || fail 'Missing Mobile/.env.example'

  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 26 || (major === 26 && minor < 5)) process.exit(1);
  ' || fail 'Node.js 26.5 or newer is required'

  expected_pnpm=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).packageManager.split("@")[1]')
  actual_pnpm=$(pnpm --version)
  [ "$actual_pnpm" = "$expected_pnpm" ] || fail "PNPM $expected_pnpm is required, found $actual_pnpm"

  java_version=$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')
  [ "$java_version" = '17' ] || fail "Java 17 is required, found ${java_version:-unknown}"

  if [ "$(uname -s)" = 'Darwin' ]; then
    require_command xcodebuild
    xcodebuild -version >/dev/null
  fi

  if command -v adb >/dev/null 2>&1; then
    adb version >/dev/null
  else
    log 'Android SDK platform-tools not found; Android launch will be unavailable.'
  fi

  (cd "$ROOT_DIR" && compose config --quiet)
  log 'Environment and Compose configuration are ready.'
}

case "$ACTION" in
  check)
    check_environment
    ;;
  up)
    check_environment
    log 'Generating ignored local certificates.'
    "$ROOT_DIR/scripts/generate-dev-certificates.sh"
    log "Starting isolated Compose project $PROJECT_NAME."
    compose up --detach --build --wait --wait-timeout "$WAIT_TIMEOUT"
    curl --fail --silent --show-error "http://127.0.0.1:$HTTP_PORT/health" >/dev/null
    MOBILE_DEMO_PROJECT_NAME="$PROJECT_NAME" MOBILE_DEMO_ENV_FILE="$ENV_FILE" \
      MOBILE_DEMO_DOCKER_CONTEXT="$DOCKER_CONTEXT_NAME" \
      MOBILE_DEMO_ORIGIN="http://127.0.0.1:$HTTP_PORT" \
      "$ROOT_DIR/Mobile/scripts/manage-phase7-demo-fixtures.sh" seed
    log 'Demo backend, synthetic accounts and showcase incidents are ready.'
    ;;
  status)
    resolve_docker_context
    compose ps
    curl --fail --silent --show-error "http://127.0.0.1:$HTTP_PORT/health"
    ;;
  seed)
    resolve_docker_context
    MOBILE_DEMO_PROJECT_NAME="$PROJECT_NAME" MOBILE_DEMO_ENV_FILE="$ENV_FILE" \
      MOBILE_DEMO_DOCKER_CONTEXT="$DOCKER_CONTEXT_NAME" \
      MOBILE_DEMO_ORIGIN="http://127.0.0.1:$HTTP_PORT" \
      "$ROOT_DIR/Mobile/scripts/manage-phase7-demo-fixtures.sh" seed
    ;;
  ios)
    require_command xcodebuild
    cd "$ROOT_DIR"
    EXPO_PUBLIC_APP_ENV=development \
      EXPO_PUBLIC_ALLOW_HTTP_ORIGIN=true \
      EXPO_PUBLIC_API_ORIGIN="http://127.0.0.1:$HTTP_PORT" \
      pnpm --dir Mobile ios
    ;;
  android)
    require_command adb
    cd "$ROOT_DIR"
    EXPO_PUBLIC_APP_ENV=development \
      EXPO_PUBLIC_ALLOW_HTTP_ORIGIN=true \
      EXPO_PUBLIC_API_ORIGIN="http://10.0.2.2:$HTTP_PORT" \
      pnpm --dir Mobile android
    ;;
  down)
    resolve_docker_context
    compose down --remove-orphans
    log 'Demo containers stopped; volumes and generated credentials were preserved.'
    ;;
  clean)
    resolve_docker_context
    compose down --volumes --remove-orphans
    rm -rf "$ROOT_DIR/.state/mobile-demo"
    log 'Demo containers, volumes and generated credentials were removed.'
    ;;
  *)
    fail 'Usage: mobile-demo.sh check|up|status|seed|ios|android|down|clean'
    ;;
esac
