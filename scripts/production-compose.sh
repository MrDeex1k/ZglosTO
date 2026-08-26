#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PRODUCTION_ENV_FILE:-$ROOT_DIR/.env.production}"
STATE_DIR="${PRODUCTION_STATE_DIR:-$ROOT_DIR/.state/production-compose}"
BACKUP_ROOT="${PRODUCTION_BACKUP_ROOT:-$STATE_DIR/backups}"
BACKUP_RETENTION_COUNT="${PRODUCTION_BACKUP_RETENTION_COUNT:-7}"
WAIT_TIMEOUT_SECONDS="${PRODUCTION_WAIT_TIMEOUT_SECONDS:-300}"
LOCK_DIR="$STATE_DIR/operation.lock"
SECRET_MANIFEST="$ROOT_DIR/deploy/compose/required-secret-files.txt"
DEFAULT_BUILD_CANDIDATE_DIR="$ROOT_DIR/.state/production-build/candidate"
if [ -n "${PRODUCTION_IMAGES_ENV_FILE:-}" ]; then
  IMAGES_ENV_FILE="$PRODUCTION_IMAGES_ENV_FILE"
elif [ -f "$STATE_DIR/current.images.env" ]; then
  IMAGES_ENV_FILE="$STATE_DIR/current.images.env"
else
  IMAGES_ENV_FILE="$DEFAULT_BUILD_CANDIDATE_DIR/images.env"
fi
if [ -n "${PRODUCTION_BUILD_MANIFEST_FILE:-}" ]; then
  BUILD_MANIFEST_FILE="$PRODUCTION_BUILD_MANIFEST_FILE"
elif [ "$IMAGES_ENV_FILE" = "$STATE_DIR/current.images.env" ]; then
  BUILD_MANIFEST_FILE="$STATE_DIR/current.manifest.json"
else
  BUILD_MANIFEST_FILE="$(dirname "$IMAGES_ENV_FILE")/manifest.json"
fi

compose=()
external_services=()
OBJECT_STORAGE_MODE=
REDIS_MODE=
OBSERVABILITY_MODE=
LLM_MODE=
COMPOSE_CONFIGURED=0
LOCK_ACQUIRED=0

log() {
  printf '[production-compose] %s\n' "$*"
}

fail() {
  printf '[production-compose] ERROR: %s\n' "$*" >&2
  exit 1
}

require_positive_integer() {
  local name=$1
  local value=$2
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || fail "$name must be a positive integer"
}

read_env_value() {
  local name=$1
  awk -F= -v name="$name" '$1 == name { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

read_mode() {
  local name=$1
  local fallback=$2
  local value
  value="$(read_env_value "$name")"
  printf '%s' "${value:-$fallback}"
}

require_mode() {
  local area=$1
  local mode=$2
  shift 2
  local allowed
  for allowed in "$@"; do
    [ "$mode" = "$allowed" ] && return
  done
  fail "$area mode '$mode' is unsupported; expected one of: $*"
}

append_compose_file() {
  compose+=(--file "$ROOT_DIR/$1")
}

configure_compose() {
  [ "$COMPOSE_CONFIGURED" = '0' ] || return
  [ -f "$ENV_FILE" ] || fail "Missing production environment file: $ENV_FILE"
  [ -f "$IMAGES_ENV_FILE" ] || fail "Missing verified image environment: $IMAGES_ENV_FILE"

  OBJECT_STORAGE_MODE="$(read_mode OBJECT_STORAGE_MODE local)"
  REDIS_MODE="$(read_mode REDIS_MODE disabled)"
  OBSERVABILITY_MODE="$(read_mode OBSERVABILITY_MODE disabled)"
  LLM_MODE="$(read_mode LLM_MODE disabled)"
  require_mode 'Object Storage' "$OBJECT_STORAGE_MODE" local external
  require_mode Redis "$REDIS_MODE" disabled local external
  require_mode Observability "$OBSERVABILITY_MODE" disabled local external
  require_mode LLM "$LLM_MODE" disabled local external

  unset AUTHORIZATION_IMAGE BACKEND_IMAGE DATABASE_IMAGE FRONTEND_IMAGE \
    LLM_GATEWAY_IMAGE NGINX_IMAGE PGBOUNCER_IMAGE RABBITMQ_IMAGE
  compose=(
    docker compose
    --project-directory "$ROOT_DIR"
    --env-file "$ENV_FILE"
    --env-file "$IMAGES_ENV_FILE"
    --file "$ROOT_DIR/docker-compose.no-rustfs.yml"
    --file "$ROOT_DIR/docker-compose.production.yml"
  )

  case "$OBJECT_STORAGE_MODE" in
    local)
      append_compose_file docker-compose.storage.local.yml
      external_services+=(rustfs)
      ;;
    external)
      append_compose_file docker-compose.storage.external.yml
      ;;
  esac
  case "$REDIS_MODE" in
    disabled) ;;
    local)
      append_compose_file docker-compose.redis.local.yml
      external_services+=(redis)
      ;;
    external) append_compose_file docker-compose.redis.external.yml ;;
  esac
  case "$OBSERVABILITY_MODE" in
    disabled) ;;
    local)
      append_compose_file docker-compose.observability.local.yml
      external_services+=(otel-collector prometheus loki tempo alertmanager grafana)
      ;;
    external)
      append_compose_file docker-compose.observability.external.yml
      external_services+=(otel-collector)
      ;;
  esac
  case "$LLM_MODE" in
    disabled) ;;
    local) append_compose_file docker-compose.llm.yml ;;
    external) append_compose_file docker-compose.llm.external.yml ;;
  esac
  COMPOSE_CONFIGURED=1
}

reset_compose_configuration() {
  compose=()
  external_services=()
  OBJECT_STORAGE_MODE=
  REDIS_MODE=
  OBSERVABILITY_MODE=
  LLM_MODE=
  COMPOSE_CONFIGURED=0
}

validate_mode_secret_file() {
  local name=$1
  local path
  path="$(read_env_value "$name")"
  [ -n "$path" ] || fail "$name is required by the selected module mode"
  if [[ "$path" != /* ]]; then
    path="$ROOT_DIR/$path"
  fi
  [ -s "$path" ] || fail "Missing or empty module secret file: $path"
}

validate_secret_files() {
  local secrets_dir secret_file
  secrets_dir="$(read_env_value ZTO_SECRETS_DIR)"
  [ -n "$secrets_dir" ] || fail "ZTO_SECRETS_DIR is missing from $ENV_FILE"

  if [[ "$secrets_dir" != /* ]]; then
    secrets_dir="$ROOT_DIR/$secrets_dir"
  fi

  while IFS= read -r secret_file; do
    [ -n "$secret_file" ] || continue
    [ -f "$secrets_dir/$secret_file" ] || fail "Missing secret file: $secrets_dir/$secret_file"
    [ -s "$secrets_dir/$secret_file" ] || fail "Empty secret file: $secrets_dir/$secret_file"
  done < "$SECRET_MANIFEST"

  case "$REDIS_MODE" in
    disabled) ;;
    local)
      validate_mode_secret_file REDIS_URL_SECRET_FILE
      validate_mode_secret_file RATE_LIMIT_HMAC_KEY_SECRET_FILE
      validate_mode_secret_file REDIS_ACL_FILE
      ;;
    external)
      validate_mode_secret_file REDIS_URL_SECRET_FILE
      validate_mode_secret_file RATE_LIMIT_HMAC_KEY_SECRET_FILE
      validate_mode_secret_file REDIS_TLS_CA_FILE
      ;;
  esac
  [ "$OBSERVABILITY_MODE" != 'local' ] ||
    validate_mode_secret_file GRAFANA_ADMIN_PASSWORD_FILE
  [ "$OBSERVABILITY_MODE" != 'external' ] ||
    validate_mode_secret_file OTEL_EXTERNAL_AUTHORIZATION_FILE
  [ "$LLM_MODE" != 'external' ] ||
    validate_mode_secret_file LLM_EXTERNAL_API_KEY_FILE
}

validate() {
  require_positive_integer PRODUCTION_WAIT_TIMEOUT_SECONDS "$WAIT_TIMEOUT_SECONDS"
  require_positive_integer PRODUCTION_BACKUP_RETENTION_COUNT "$BACKUP_RETENTION_COUNT"
  configure_compose
  command -v docker >/dev/null 2>&1 || fail "docker is not installed"
  command -v curl >/dev/null 2>&1 || fail "curl is not installed"
  validate_secret_files
  node "$ROOT_DIR/scripts/check-production-compose.ts" \
    "$ENV_FILE" \
    --images-env "$IMAGES_ENV_FILE" \
    --manifest "$BUILD_MANIFEST_FILE" \
    --inspect-local-images \
    --object-storage "$OBJECT_STORAGE_MODE" \
    --redis "$REDIS_MODE" \
    --observability "$OBSERVABILITY_MODE" \
    --llm "$LLM_MODE"
  "${compose[@]}" config --quiet
}

release_lock() {
  if [ "$LOCK_ACQUIRED" = '1' ]; then
    rm -f "$LOCK_DIR/pid"
    rmdir "$LOCK_DIR" 2>/dev/null || true
    LOCK_ACQUIRED=0
  fi
}

acquire_lock() {
  mkdir -p "$STATE_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    local lock_pid=
    [ ! -f "$LOCK_DIR/pid" ] || read -r lock_pid < "$LOCK_DIR/pid"
    if [[ "$lock_pid" =~ ^[1-9][0-9]*$ ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
      log "Removing stale operation lock left by PID $lock_pid"
      rm -f "$LOCK_DIR/pid"
      rmdir "$LOCK_DIR" 2>/dev/null ||
        fail "Cannot remove stale operation lock: $LOCK_DIR"
      mkdir "$LOCK_DIR" || fail "Cannot acquire operation lock: $LOCK_DIR"
    else
      fail "Another production Compose operation is active: $LOCK_DIR"
    fi
  fi
  printf '%s\n' "$$" > "$LOCK_DIR/pid"
  chmod 0600 "$LOCK_DIR/pid"
  LOCK_ACQUIRED=1
  trap release_lock EXIT
  trap 'release_lock; exit 130' INT
  trap 'release_lock; exit 143' TERM
}

smoke() {
  configure_compose
  local base_url
  base_url="${PUBLIC_BASE_URL:-$(read_env_value PUBLIC_BASE_URL)}"
  [ -n "$base_url" ] || fail "PUBLIC_BASE_URL is required for the production smoke test"
  base_url="${base_url%/}"

  log "Checking public HTTPS and application readiness"
  curl --fail --silent --show-error "$base_url/health" >/dev/null
  curl --fail --silent --show-error "$base_url/api/health/ready" >/dev/null
  curl --fail --silent --show-error "$base_url/api/auth/get-session" >/dev/null
  curl --fail --silent --show-error "$base_url/llm/health" >/dev/null
}

run_migrations() {
  configure_compose
  log "Applying versioned database migrations"
  "${compose[@]}" exec -T database sh -ceu '
    for migration in /opt/zglosto/migrations/*.sql; do
      psql -v ON_ERROR_STOP=1 "$DATABASE_DIRECT_URL" < "$migration"
    done
  '
}

copy_private_atomically() {
  local source=$1
  local destination=$2
  local temporary="$destination.tmp.$$"
  install -m 0600 "$source" "$temporary"
  mv -f "$temporary" "$destination"
}

promote_environment() {
  mkdir -p "$STATE_DIR"
  chmod 0700 "$STATE_DIR"
  copy_private_atomically "$IMAGES_ENV_FILE" "$STATE_DIR/current.images.env"
  copy_private_atomically "$BUILD_MANIFEST_FILE" "$STATE_DIR/current.manifest.json"
  copy_private_atomically "$ENV_FILE" "$STATE_DIR/current.env"
  rm -f "$STATE_DIR/previous.env" "$STATE_DIR/previous.images.env" \
    "$STATE_DIR/previous.manifest.json"
}

pull_external_images() {
  configure_compose
  if [ "${#external_services[@]}" -eq 0 ]; then
    log 'No external container image is enabled for this module selection'
    return
  fi
  log "Pulling pinned external components: ${external_services[*]}"
  "${compose[@]}" pull "${external_services[@]}"
}

create_backup_unlocked() {
  local destination=$1
  "$ROOT_DIR/scripts/backup-compose.sh" "$destination" "${compose[@]:2}"
}

prune_backup_history() {
  local backups=()
  local index
  [ -d "$BACKUP_ROOT" ] || return
  while IFS= read -r path; do
    backups+=("$path")
  done < <(
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'auto-*' -print | sort -r
  )
  for ((index = BACKUP_RETENTION_COUNT; index < ${#backups[@]}; index += 1)); do
    log "Removing expired automatic backup ${backups[$index]}"
    rm -rf -- "${backups[$index]}"
  done
}

automatic_backup() {
  local running
  running="$("${compose[@]}" ps --status running --services database 2>/dev/null || true)"
  if ! grep -qx database <<< "$running"; then
    if has_current_release; then
      fail 'A promoted release exists but its database is stopped; start/recover it before deploying so the mandatory backup can run'
    fi
    log 'No earlier promoted release exists; skipping the first-install backup'
    return
  fi
  local destination="$BACKUP_ROOT/auto-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$BACKUP_ROOT"
  chmod 0700 "$BACKUP_ROOT"
  log "Creating mandatory pre-deployment backup at $destination"
  create_backup_unlocked "$destination"
  prune_backup_history
}

deploy_candidate_steps() {
  pull_external_images || return
  automatic_backup || return
  log "Starting PostgreSQL before migrations"
  "${compose[@]}" up --detach --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS" database || return
  run_migrations || return
  log "Starting the complete production profile"
  "${compose[@]}" up --detach --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS" \
    --remove-orphans || return
  smoke || return
}

has_current_release() {
  [ -s "$STATE_DIR/current.env" ] &&
    [ -s "$STATE_DIR/current.images.env" ] &&
    [ -s "$STATE_DIR/current.manifest.json" ]
}

recover_current_release() {
  has_current_release ||
    fail 'Candidate failed and no previously promoted release exists; inspect the partial deployment'
  log 'Candidate failed; recreating the last promoted application release'
  ENV_FILE="$STATE_DIR/current.env"
  IMAGES_ENV_FILE="$STATE_DIR/current.images.env"
  BUILD_MANIFEST_FILE="$STATE_DIR/current.manifest.json"
  reset_compose_configuration
  validate
  pull_external_images
  "${compose[@]}" up --detach --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS" \
    --remove-orphans
  smoke
  log 'Last promoted release recovered; database migrations were not reversed'
}

prune_inactive_images() {
  local current_references=
  local reference
  current_references="$(cut -d= -f2- "$STATE_DIR/current.images.env")"
  while IFS= read -r reference; do
    case "$reference" in
      zglosto/authorization:* | zglosto/backend:* | zglosto/database:* | \
        zglosto/frontend:* | zglosto/llm-gateway:* | zglosto/nginx:* | \
        zglosto/pgbouncer:* | zglosto/rabbitmq:*) ;;
      *) continue ;;
    esac
    if ! grep -Fxq "$reference" <<< "$current_references"; then
      log "Removing inactive local release image $reference"
      docker image rm "$reference"
    fi
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}')
}

deploy_release() {
  validate
  acquire_lock
  if ! deploy_candidate_steps; then
    recover_current_release
    return 1
  fi
  promote_environment
  prune_inactive_images
  log "Deployment completed and promoted"
}

rollback_release() {
  fail 'Previous images are not retained. Rebuild the required exact Git tag and deploy it; database migrations are never reversed automatically.'
}

rotate_certificates() {
  validate
  acquire_lock
  log "Recreating TLS consumers with the rotated secret files"
  "${compose[@]}" up --detach --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS" --force-recreate \
    database pgbouncer rabbitmq authorization backend media_worker nginx
  smoke
}

backup() {
  local destination=${1:-}
  [ -n "$destination" ] || fail "backup requires a destination directory"
  validate
  acquire_lock
  create_backup_unlocked "$destination"
}

restore() {
  local source=${1:-}
  [ -n "$source" ] || fail "restore requires a backup directory"
  [ "${ALLOW_PRODUCTION_RESTORE:-0}" = '1' ] ||
    fail "Set ALLOW_PRODUCTION_RESTORE=1 after confirming the maintenance window"
  validate
  acquire_lock
  "$ROOT_DIR/scripts/restore-compose.sh" "$source" "${compose[@]:2}"
  smoke
}

verify_host() {
  [ "$(uname -s)" = 'Linux' ] || fail 'the production host must run Linux'
  for executable in docker curl node nft; do
    command -v "$executable" >/dev/null 2>&1 ||
      fail "$executable is not installed on the production host"
  done
  docker compose version >/dev/null
  mkdir -p "$STATE_DIR" "$BACKUP_ROOT"
  chmod 0700 "$STATE_DIR" "$BACKUP_ROOT"
  log 'Host prerequisites passed; remember that membership in the docker group grants root-equivalent access'
}

usage() {
  printf '%s\n' \
    'Usage: production-compose.sh COMMAND [ARG]' \
    'Commands:' \
    '  validate              validate local images, modes, secrets and rendered Compose' \
    '  pull                  pull only enabled external component images' \
    '  up                    start the current release after host restart' \
    '  deploy                pull, migrate, start, smoke and promote release state' \
    '  rollback              explain the exact-tag rebuild rollback procedure' \
    '  smoke                 verify public HTTPS routes' \
    '  rotate-certs          recreate TLS consumers after atomic secret replacement' \
    '  backup DIRECTORY      create a consistent database/Object Storage backup' \
    '  restore DIRECTORY     restore with ALLOW_PRODUCTION_RESTORE=1' \
    '  recover-current       recreate the last promoted release without reverting migrations' \
    '  prune-images          retain only images from the promoted release' \
    '  verify-host           verify Linux, Docker, nftables and private state directories' \
    '  status                show service status' \
    '  stop                  stop services without deleting data'
}

command_name=${1:-}
shift || true

case "$command_name" in
  validate)
    validate
    ;;
  pull)
    validate
    acquire_lock
    pull_external_images
    ;;
  up)
    validate
    acquire_lock
    "${compose[@]}" up --detach --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS" --remove-orphans
    smoke
    ;;
  deploy)
    deploy_release
    ;;
  rollback)
    rollback_release
    ;;
  smoke)
    validate
    smoke
    ;;
  rotate-certs)
    rotate_certificates
    ;;
  backup)
    backup "$@"
    ;;
  restore)
    restore "$@"
    ;;
  recover-current)
    acquire_lock
    recover_current_release
    ;;
  prune-images)
    acquire_lock
    has_current_release || fail 'No promoted release exists'
    prune_inactive_images
    ;;
  verify-host)
    verify_host
    ;;
  status)
    configure_compose
    "${compose[@]}" ps
    ;;
  stop)
    configure_compose
    acquire_lock
    "${compose[@]}" stop
    ;;
  *)
    usage
    exit 64
    ;;
esac
