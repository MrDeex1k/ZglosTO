#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY="$ROOT_DIR/scripts/check-frontend-boundary.sh"
FIXTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/zglosto-frontend-boundary.XXXXXX")"

cleanup() {
  rm -rf "$FIXTURE_DIR"
}
trap cleanup EXIT

mkdir -p "$FIXTURE_DIR/frontend/src/server/bff"

write_manifest() {
  printf '%s\n' "$1" >"$FIXTURE_DIR/frontend/package.json"
}

run_policy() {
  FRONTEND_BOUNDARY_DIR="$FIXTURE_DIR/frontend" "$POLICY"
}

expect_rejection() {
  local label="$1"
  if run_policy >/dev/null 2>&1; then
    printf 'Frontend boundary policy accepted forbidden fixture: %s\n' "$label" >&2
    exit 1
  fi
}

write_manifest '{"name":"fixture","private":true,"dependencies":{"react":"19.2.7"}}'
printf '%s\n' "export const loadIncidents = () => fetch('/api/mieszkaniec/incydenty');" \
  >"$FIXTURE_DIR/frontend/src/api.ts"
run_policy >/dev/null

write_manifest '{"name":"fixture","private":true,"dependencies":{"pg":"8.22.0"}}'
expect_rejection 'database dependency'

write_manifest '{"name":"fixture","private":true,"dependencies":{}}'
printf '%s\n' "import { S3Client } from '@aws-sdk/client-s3';" \
  >"$FIXTURE_DIR/frontend/src/api.ts"
expect_rejection 'Object Storage import'

printf '%s\n' "export const databaseUrl = process.env.DATABASE_URL;" \
  >"$FIXTURE_DIR/frontend/src/api.ts"
expect_rejection 'database credential'

printf '%s\n' \
  "import { createServerFn } from '@tanstack/react-start';" \
  "export const domainQuery = createServerFn().handler(() => null);" \
  >"$FIXTURE_DIR/frontend/src/domain.server.ts"
expect_rejection 'server function outside BFF boundary'

rm "$FIXTURE_DIR/frontend/src/domain.server.ts"
printf '%s\n' "export const loadIncidents = () => fetch('/api/mieszkaniec/incydenty');" \
  >"$FIXTURE_DIR/frontend/src/api.ts"
printf '%s\n' \
  "import { createServerFn } from '@tanstack/react-start';" \
  "export const proxyQuery = createServerFn().handler(() => fetch('/api/config/public'));" \
  >"$FIXTURE_DIR/frontend/src/server/bff/config.server.ts"
run_policy >/dev/null

printf 'Frontend boundary policy fixtures passed.\n'
