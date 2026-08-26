#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SCOPED_PATHS=(
  authorization
  backend
  database
  docker-compose.yml
  docker-compose.no-rustfs.yml
  docker-compose.rustfs.yml
  frontend/src
  k8s
  packages
)

SOURCE_GLOBS=(
  --glob '*.{ts,tsx,sql,yaml,yml}'
  --glob '!**/*.test.ts'
  --glob '!**/*.test.tsx'
  --glob '!**/node_modules/**'
  --glob '!**/dist/**'
)

if rg -n -i '\btenant(_?id|_?key)?\b|multi.?tenant' "${SCOPED_PATHS[@]}" "${SOURCE_GLOBS[@]}"; then
  printf 'Runtime multitenancy identifiers are forbidden in the single-city deployment model.\n' >&2
  exit 1
fi

if rg -n '\b(cities|cityConfigs|city_configs)\b' "${SCOPED_PATHS[@]}" "${SOURCE_GLOBS[@]}"; then
  printf 'Runtime collections of city configs are forbidden; mount one config per deployment.\n' >&2
  exit 1
fi

printf 'Single-city architecture policy passed.\n'
