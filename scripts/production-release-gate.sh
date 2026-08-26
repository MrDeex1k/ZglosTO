#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCTION_SCRIPT="$ROOT_DIR/scripts/production-compose.sh"

fail() {
  printf '[production-release-gate] ERROR: %s\n' "$*" >&2
  exit 1
}

static_gate() {
  cd "$ROOT_DIR"
  CI=true pnpm check
  pnpm audit:release
  node scripts/test-production-compose-policy.ts
  printf '[production-release-gate] Static release gate passed\n'
}

validate_gate() {
  "$PRODUCTION_SCRIPT" verify-host
  "$PRODUCTION_SCRIPT" validate
  printf '[production-release-gate] Candidate and production host validation passed\n'
}

runtime_gate() {
  [ "${PRODUCTION_GATE_RUNTIME:-0}" = '1' ] ||
    fail 'set PRODUCTION_GATE_RUNTIME=1 only on the dedicated staging/acceptance host'
  validate_gate
  "$PRODUCTION_SCRIPT" deploy
  "$PRODUCTION_SCRIPT" smoke
  "$PRODUCTION_SCRIPT" stop
  "$PRODUCTION_SCRIPT" up
  "$PRODUCTION_SCRIPT" smoke

  local backup_directory
  backup_directory="${PRODUCTION_GATE_BACKUP_DIRECTORY:-${PRODUCTION_BACKUP_ROOT:-/var/backups/zglosto}/release-gate-$(date -u +%Y%m%dT%H%M%SZ)}"
  "$PRODUCTION_SCRIPT" backup "$backup_directory"

  if [ "${PRODUCTION_GATE_RESTORE:-0}" = '1' ]; then
    ALLOW_PRODUCTION_RESTORE=1 "$PRODUCTION_SCRIPT" restore "$backup_directory"
  else
    printf '[production-release-gate] Restore drill skipped; run in a maintenance window with PRODUCTION_GATE_RESTORE=1\n'
  fi
  printf '[production-release-gate] Runtime release gate passed\n'
}

case "${1:-}" in
  static) static_gate ;;
  validate) validate_gate ;;
  runtime) runtime_gate ;;
  *)
    printf '%s\n' \
      'Usage: production-release-gate.sh static|validate|runtime' \
      '  static    full source, test, build, matrix and negative-policy gate' \
      '  validate  candidate image, host, secret and Compose validation' \
      '  runtime   guarded staging deploy/restart/backup/optional-restore drill'
    exit 64
    ;;
esac
